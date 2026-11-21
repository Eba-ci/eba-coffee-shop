/*
 * Service worker léger pour EBA Coffee Shop (PWA).
 *
 * Objectifs volontairement limités :
 *  - Rendre l'app installable (un SW avec un handler `fetch` est requis par
 *    Chrome/Android pour déclencher `beforeinstallprompt`).
 *  - Servir une page de secours hors-ligne pour les navigations.
 *  - Mettre en cache les assets statiques (cache-first) pour accélérer les
 *    visites répétées.
 *
 * Règles de sécurité : on NE met JAMAIS en cache le dashboard, les routes
 * d'API ni l'authentification — ces contenus doivent toujours venir du réseau.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `eba-pwa-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

// Pré-cache minimal : la coquille hors-ligne + le logo.
const PRECACHE_URLS = [OFFLINE_URL, '/assets/logos/eba.svg'];

// Chemins qui ne doivent jamais être interceptés / mis en cache.
const BYPASS_PREFIXES = ['/api/', '/dashboard', '/login', '/.well-known'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('eba-pwa-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function shouldBypass(url) {
  return BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne gère que le GET same-origin.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  // Navigations (pages) → network-first avec repli hors-ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(OFFLINE_URL);
          return (
            cached ??
            new Response('Hors ligne', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // Assets statiques (images, scripts, styles, polices) → cache-first.
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|ico)$/.test(
      url.pathname
    );

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })()
  );
});

// ─── Notifications push (backoffice) ───────────────────────────────────────
//
// Payload JSON envoyé par lib/push-notify.ts : { title, body, url?, tag? }.

self.addEventListener('push', (event) => {
  let payload = { title: 'EBA Coffee Shop', body: '' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Payload non-JSON : on garde le titre par défaut.
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/web-app-manifest-192x192.png',
        badge: '/web-app-manifest-192x192.png',
        tag: payload.tag,
        data: { url: payload.url || '/dashboard' },
      });
      // Le son « nouvelle commande » du dashboard ne passe plus par le push :
      // il est joué par le flux SSE (components/(dashboard)/order-sound-listener.tsx).
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Chemin ET paramètres : `/carte?p=<id>` (alerte « de retour ») doit
      // ouvrir la fiche du produit, pas seulement remettre au premier plan
      // un onglet `/carte` quelconque.
      const existing = allClients.find((c) => {
        const url = new URL(c.url);
        return url.pathname + url.search === targetUrl;
      });
      if (existing) {
        await existing.focus();
        return;
      }
      const anyClient = allClients[0];
      if (anyClient) {
        await anyClient.focus();
        await anyClient.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
