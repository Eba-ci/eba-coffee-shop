import { setDefaultResultOrder } from 'node:dns';
import type { NextConfig } from 'next';
import { varlockNextConfigPlugin } from '@varlock/nextjs-integration/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';

setDefaultResultOrder('ipv4first');

const isProduction = process.env.NODE_ENV === 'production';
// Le pixel Meta est optionnel (cf. components/analytics/meta-pixel.tsx) : ses
// domaines n'entrent dans la CSP que s'il est réellement configuré — pas de
// script-src élargi « au cas où » sur une installation qui ne s'en sert pas.
const hasMetaPixel = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);

// ─── Content Security Policy ─────────────────────────────────────────────────
//
// Politique minimale qui couvre les besoins actuels de l'app :
// - Next.js injecte des scripts inline pour l'hydration → `'unsafe-inline'`
//   reste indispensable sans nonce-strategy (qu'on n'a pas câblée ici).
// - Tailwind v4 + HeroUI injectent des styles inline → idem pour `style-src`.
// - Images : `'self'` pour les uploads locaux (`/uploads/products/*`, repli
//   legacy), plus `*.public.blob.vercel-storage.com` (legacy Vercel Blob) et
//   `res.cloudinary.com` (nouveaux uploads, cf. lib/cloudinary.ts).
// - `connect-src` autorise `api.cloudinary.com` : l'upload signé part
//   directement du navigateur vers Cloudinary, sans passer par notre serveur.
// - En dev, Next ouvre une websocket pour le HMR → on élargit `connect-src`.
// - TikTok : seul `frame-src` est nécessaire. On construit nous-mêmes l'iframe
//   `www.tiktok.com/embed/v2/...` au clic (cf. tiktok-embed.tsx) au lieu de
//   charger le script `embed.js` — plus aucun JS ni image TikTok sur NOTRE
//   page (les miniatures sont rapatriées en local, cf. lib/uploads.ts), donc
//   `script-src`/`img-src` n'ont plus à whitelister TikTok. Ce que l'iframe
//   charge en interne relève de la CSP de tiktok.com, pas de la nôtre.
// - Google Tag Manager (site public uniquement, cf. app/(public)/layout.tsx) :
//   `googletagmanager.com` sert gtm.js ET gtag/js ; GA4 collecte sur
//   `google-analytics.com` (+ sous-domaines régionaux `*.analytics.google.com`)
//   et pose des pixels de repli sur `img-src`. Le script d'amorçage Consent
//   Mode est inline — déjà couvert par `'unsafe-inline'` ci-dessus.
// - Pixel Meta (`connect.facebook.net` pour le script, `www.facebook.com` pour
//   la collecte et les pixels image) : ouvert UNIQUEMENT si
//   NEXT_PUBLIC_META_PIXEL_ID est configuré.
//   ⚠️ ATTENTION EXPLOITANT : cette CSP borne aussi ce que le conteneur GTM a le
//   droit de charger. Ajouter un tag tiers depuis l'interface web de GTM (Google
//   Ads, TikTok Pixel…) ne suffira PAS : son domaine doit être ajouté ici, puis
//   l'app redéployée, sinon le navigateur le bloque. Le pixel Meta, lui, est
//   câblé nativement (variable d'env ci-dessus) — inutile de l'ajouter à GTM.
const cspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    'https://static.cloudflareinsights.com',
    'https://www.googletagmanager.com',
    ...(hasMetaPixel ? ['https://connect.facebook.net'] : []),
    ...(isProduction ? [] : ["'unsafe-eval'"]),
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.public.blob.vercel-storage.com',
    'https://res.cloudinary.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    ...(hasMetaPixel ? ['https://www.facebook.com'] : []),
  ],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://cloudflareinsights.com',
    'https://api.cloudinary.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    ...(hasMetaPixel ? ['https://www.facebook.com'] : []),
    ...(isProduction ? [] : ['ws:', 'wss:']),
  ],
  'frame-src': [
    'https://www.google.com',
    'https://www.tiktok.com',
    // Mode Aperçu de GTM (Tag Assistant) — hors production uniquement.
    ...(isProduction ? [] : ['https://tagassistant.google.com']),
  ],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
};

const cspHeaderValue = Object.entries(cspDirectives)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  { key: 'Content-Security-Policy', value: cspHeaderValue },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['eba.otw.ci', '127.0.0.1'],
  // Image Docker (blue/green) : `.next/standalone` embarque le serveur et ses
  // seules dépendances tracées. Activé par le Dockerfile uniquement
  // (BUILD_STANDALONE=1) : la prod pm2 lance `next start`, incompatible avec ce
  // mode. `generated/prisma` est gitignoré et chargé via un alias : on le force
  // dans la trace pour qu'il soit copié dans l'image.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingIncludes: {
    '/**': ['./generated/prisma/**/*'],
  },
  serverExternalPackages: ['@prisma/client'],
  // SHA du commit (CD) : le client recharge au lieu de « Failed to find Server Action ».
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  // NB : pas d'`experimental.optimizePackageImports` ici. Le réflexe serait de
  // l'activer pour `@heroui/react` (barrel importé par 72 fichiers), mais la
  // mesure donne un bundle identique à l'octet près : Turbopack, utilisé par
  // défaut depuis Next 16, optimise déjà les barrels nativement. L'option
  // reste valide et silencieuse — donc trompeuse si on la laisse traîner.
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // Les fichiers de `public/` sortent sans `Cache-Control` : Next leur
      // applique `max-age=0`, donc chaque navigation les revalide. Sur les
      // assets de marque (logos de la navbar et du footer, présents sur
      // TOUTES les pages), ça fait un aller-retour par page pour un contenu
      // qui ne bouge jamais — coûteux sur une connexion mobile ivoirienne où
      // le RTT pèse plus que les octets.
      //
      // Un jour de fraîcheur plutôt qu'`immutable` : les noms de fichiers ne
      // sont pas hashés (contrairement à `/_next/static/*`), donc `immutable`
      // piégerait un logo remplacé dans les caches pendant un an. Le
      // `stale-while-revalidate` d'une semaine absorbe le reste : le visiteur
      // reçoit l'ancienne version instantanément pendant que le navigateur
      // rafraîchit en arrière-plan.
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(varlockNextConfigPlugin()(nextConfig), {
  org: 'enpiss',
  project: 'eba-coffee-shop',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
