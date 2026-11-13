// lib/ai/assistant/mask-pii.ts
//
// L'assistant envoie les résultats d'outils à OpenRouter puis au fournisseur du
// modèle, hors Côte d'Ivoire. Les numéros de téléphone des clients (et du
// livreur) n'ont pas à y partir en clair : on garde de quoi reconnaître une
// personne dans la conversation (deux derniers chiffres) sans l'exposer. Les
// identifiants (`id`) restent intacts, ce qui suffit aux outils de suite.
//
// Confidentialité des salaires : les données nominatives de paie (employés,
// taux, versements, avances) n'ont AUCUN sous-traitant externe (cf.
// config/data-protection.ts). En défense en profondeur, toute charge utile
// rattachée à un employé ou à la paie est retirée EN BLOC avant l'envoi au
// modèle — même si un outil salaires venait à être exposé par erreur.

const PHONE_KEY = /phone|whatsapp|tel$/i;
// Clés rattachées à un employé ou à la paie (nom, montant, versement…).
const SALARY_KEY = /employ|salari|salary|paie|payroll|rémunér|remuner/i;
const REDACTED = '****';

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `****${digits.slice(-2)}`;
}

/** Copie profonde de `value` où toute clé « téléphone » est masquée. */
export function maskPhonesDeep(value: unknown): unknown {
  return mapDeep(value, (key, v) =>
    PHONE_KEY.test(key) && typeof v === 'string' ? maskPhone(v) : v
  );
}

/**
 * Copie profonde de `value` avant envoi au modèle : numéros masqués et toute
 * charge utile « employé / paie » retirée en bloc.
 */
export function maskPiiDeep(value: unknown): unknown {
  return mapDeep(value, (key, v) =>
    SALARY_KEY.test(key)
      ? REDACTED
      : PHONE_KEY.test(key) && typeof v === 'string'
        ? maskPhone(v)
        : v
  );
}

function mapDeep(
  value: unknown,
  transform: (key: string, value: unknown) => unknown
): unknown {
  if (Array.isArray(value)) return value.map((v) => mapDeep(v, transform));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        transform(
          k,
          v && typeof v === 'object' && !(v instanceof Date)
            ? mapDeep(v, transform)
            : v
        ),
      ])
    );
  }
  return value;
}
