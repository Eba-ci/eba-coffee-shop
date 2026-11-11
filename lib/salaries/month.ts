// lib/salaries/month.ts
//
// Calculs purs sur des mois civils au format « YYYY-MM » et des jours
// « YYYY-MM-DD » (Abidjan = UTC+0 : l'arithmétique UTC suffit). Aucune
// dépendance serveur : utilisable côté client comme côté serveur.

const pad = (n: number) => String(n).padStart(2, '0');

/** Valide strictement le format « YYYY-MM ». */
export function isValidMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const m = Number(month.slice(5, 7));
  return m >= 1 && m <= 12;
}

/** Nombre de jours du mois civil (« YYYY-MM » → 28..31). */
export function daysInMonth(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Premier et dernier jour civil du mois, en « YYYY-MM-DD ». */
export function monthBounds(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` };
}

/** Mois « YYYY-MM » contenant un jour « YYYY-MM-DD ». */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Tous les jours civils du mois, dans l'ordre. */
export function eachDayOfMonth(month: string): string[] {
  const { end } = monthBounds(month);
  const last = Number(end.slice(8, 10));
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${month}-${pad(d)}`);
  return out;
}

/** Mois décalé de `delta` mois (delta peut être négatif). */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const year = y + Math.floor(m / 12);
  const month1 = ((m % 12) + 12) % 12;
  return `${year}-${pad(month1 + 1)}`;
}

export function nextMonth(month: string): string {
  return shiftMonth(month, 1);
}

/** Liste des mois de `from` à `to` inclus (bornes « YYYY-MM »). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let m = from;
  while (m <= to) {
    out.push(m);
    m = nextMonth(m);
  }
  return out;
}
