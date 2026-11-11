// lib/salaries/money.ts
//
// Arithmétique monétaire en FCFA ENTIERS. Le franc CFA n'a pas de centimes :
// tout montant manipulé ici est un entier, et un partage doit retomber
// EXACTEMENT sur le total (aucun centime perdu, aucun créé). La somme des parts
// d'un montant `total` vaut donc toujours `total`.

/**
 * Répartit `total` (entier) sur des `weights` (positifs) au plus fort reste :
 * chaque part est `floor(total × w / Σw)`, puis les unités restantes vont aux
 * plus grandes fractions, à égalité par ordre d'apparition. La somme des parts
 * vaut exactement `total`. Des poids nuls ou une somme nulle répartissent à
 * parts égales.
 */
export function splitAmount(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const rounded = Math.round(total);
  let sum = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const effective =
    sum > 0 ? weights.map((w) => (w > 0 ? w : 0)) : weights.map(() => 1);
  if (sum <= 0) sum = n;

  const exact = effective.map((w) => (rounded * w) / sum);
  const out = exact.map(Math.floor);
  let rest = rounded - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (rest > 0) {
    out[order[k % n].i] += 1;
    rest -= 1;
    k += 1;
  }
  return out;
}

/**
 * Arrondit une liste de montants exacts (positifs, éventuellement
 * fractionnaires) en FCFA entiers par PLUS FORT RESTE : chaque montant est
 * tronqué, puis les unités restantes vont aux plus grandes parties
 * fractionnaires, à égalité par ordre d'apparition. La somme des entiers vaut
 * toujours `Math.round` de la somme exacte : le total ne dérive jamais.
 */
export function roundToWholeFcfa(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const floors = values.map(Math.floor);
  const target = Math.round(values.reduce((a, b) => a + b, 0));
  let rest = target - floors.reduce((a, b) => a + b, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (rest > 0) {
    floors[order[k % n].i] += 1;
    rest -= 1;
    k += 1;
  }
  return floors;
}
