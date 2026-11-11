import * as Sentry from '@sentry/nextjs';

type SentryEvent = Parameters<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSend']>
>[0];

// Corps multipart malformés envoyés par des scanners/bots (POST sur une URL au
// hasard, souvent via l'IP nue) : Next/undici les rejette avant tout code
// applicatif, il n'y a rien à corriger côté app — pur bruit.
const MALFORMED_BODY_PATTERNS = [
  /Failed to parse body as FormData/i,
  /no boundary found in multipart body/i,
];

// Message EXACT levé par les guards `requireRole*` (lib/auth-helpers.ts). Le
// layout dashboard redirige déjà vers /login (ou /) mais la page, rendue en
// parallèle, throw quand même : Sentry captait une exception pour chaque
// visiteur déconnecté. L'UX est gérée (redirection ou `dashboard/error.tsx`) et
// `getSession` logge côté serveur les vrais problèmes de cookie.
const UNAUTHORIZED_MESSAGE = 'Non autorisé';

// « Failed to find Server Action » est légitime après un déploiement (onglet
// resté ouvert sur l'ancien build) : on ne l'écarte que lorsque la requête vise
// une URL de scanner — WordPress (`/wp-admin/admin-ajax.php`) ou IP nue.
const SERVER_ACTION_NOT_FOUND = /Failed to find Server Action/i;
const SCANNER_PATH = /\/wp-|\.php(?:$|[?#])/i;
const BARE_IP_HOST = /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\])$/i;

function isScannerUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const { hostname, pathname, search } = new URL(rawUrl);
    return (
      BARE_IP_HOST.test(hostname) || SCANNER_PATH.test(`${pathname}${search}`)
    );
  } catch {
    return false;
  }
}

/** Vrai pour le bruit connu : rien à corriger dans l'app, pas d'événement Sentry. */
export function shouldDropEvent(event: SentryEvent): boolean {
  const messages = (event.exception?.values ?? []).map(
    ({ value }) => value ?? ''
  );

  if (
    messages.some((message) =>
      MALFORMED_BODY_PATTERNS.some((pattern) => pattern.test(message))
    )
  ) {
    return true;
  }
  if (messages.includes(UNAUTHORIZED_MESSAGE)) return true;
  return (
    messages.some((message) => SERVER_ACTION_NOT_FOUND.test(message)) &&
    isScannerUrl(event.request?.url)
  );
}

// Les URLs de suivi (`/commande/<id>`, `/api/commandes/<id>`) portent un jeton
// d'accès à la commande, et `?phone=` un numéro de client : ni l'un ni l'autre
// ne doit quitter l'application vers un sous-traitant hors Côte d'Ivoire.
const ORDER_ID_IN_PATH = /(\/(?:api\/)?commandes?\/)[^/?#]+/gi;

// Confidentialité des salaires : ni nom d'employé ni montant individuel de paie
// ne doit figurer dans un événement Sentry. Toute clé « employé / paie » d'un
// `extra`, d'un contexte, d'une balise ou d'un fil d'Ariane est neutralisée.
const SALARY_KEY = /employ|salari|salary|paie|payroll|rémunér|remuner/i;
const REDACTED = '[masqué]';

/**
 * Motifs de TEXTE sensible : un mot-clé « employé / paie / montant » suivi
 * d'un nombre. Filet de sécurité sur les messages libres (le nom d'employé
 * libre, lui, ne peut pas être détecté de façon fiable — voir la PR).
 */
const SENSITIVE_TEXT =
  /((?:salaire|salary|paie|payroll|rémunér\w*|remuner\w*|employé\w*|employe\w*|employee\w*|montant|amount)\s*[:=]?\s*)(\d[\d\s.,]*)/gi;

/** Masque les montants accolés à un mot-clé sensible dans un texte libre. */
export function scrubSensitiveText(text: string): string {
  return text.replace(SENSITIVE_TEXT, `$1${REDACTED}`);
}

/** Neutralise récursivement toute clé « employé / paie » d'une structure. */
function redactSalaryData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) redactSalaryData(item);
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (SALARY_KEY.test(key)) record[key] = REDACTED;
      else if (typeof record[key] === 'string') {
        record[key] = scrubSensitiveText(record[key] as string);
      } else redactSalaryData(record[key]);
    }
  }
}

/** Retire query string et identifiants de commande d'une URL (best-effort). */
export function scrubUrl(rawUrl: string): string {
  return rawUrl.split(/[?#]/)[0].replace(ORDER_ID_IN_PATH, '$1:id');
}

/**
 * Minimisation des données envoyées à Sentry : pas de corps de requête, de
 * cookies, de query string, d'IP ni d'e-mail utilisateur.
 */
export function scrubPii(event: SentryEvent): SentryEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['Cookie'];
      delete event.request.headers['authorization'];
      delete event.request.headers['x-forwarded-for'];
    }
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  if (event.user) {
    delete event.user.ip_address;
    delete event.user.email;
    delete event.user.username;
  }
  // Ni nom d'employé ni montant individuel de paie dans les événements : au
  // filet (clés ET texte libre) et à la source (messages d'erreur génériques,
  // cf. `lib/salaries`). `event.message` et les valeurs d'exception portent
  // souvent le message brut d'une erreur : on les passe aussi au masquage texte.
  if (event.message) event.message = scrubSensitiveText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubSensitiveText(value.value);
  }
  redactSalaryData(event.extra);
  redactSalaryData(event.contexts);
  redactSalaryData(event.tags);
  for (const crumb of event.breadcrumbs ?? []) {
    redactSalaryData(crumb.data);
    if (crumb.message) crumb.message = scrubSensitiveText(crumb.message);
    const url = crumb.data?.url;
    if (typeof url === 'string' && crumb.data) crumb.data.url = scrubUrl(url);
  }
  return event;
}

export const sentrySharedOptions: Parameters<typeof Sentry.init>[0] = {
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  beforeSend(event) {
    return shouldDropEvent(event) ? null : scrubPii(event);
  },
};
