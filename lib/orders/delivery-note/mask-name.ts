// lib/orders/delivery-note/mask-name.ts
//
// Minimisation RGPD du bon de livraison : le livreur n'a besoin que de
// reconnaître le client, pas de son identité complète. On garde le prénom et
// l'initiale du dernier mot (« Awa Koné » → « Awa K. »). Le téléphone et
// l'adresse ne figurent jamais sur le bon.

const FALLBACK = 'Client';

export function maskCustomerName(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return FALLBACK;
  const [first, ...rest] = words;
  const last = rest[rest.length - 1];
  if (!last) return first;
  const initial = Array.from(last)[0]?.toLocaleUpperCase('fr-FR');
  return initial ? `${first} ${initial}.` : first;
}
