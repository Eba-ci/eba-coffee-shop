// lib/fixed-costs/format.ts — libellés d'affichage (pur, isomorphe).

export const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function formatPeriodLabel(start: string, end: string): string {
  const [ys, ms] = [start.slice(0, 4), Number(start.slice(5, 7))];
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (sameMonth && start.endsWith('-01') && end >= `${end.slice(0, 7)}-28`) {
    return `${MONTHS[ms - 1]} ${ys}`;
  }
  return `${formatDay(start)} → ${formatDay(end)}`;
}

export function formatDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** Abréviations indexées par `getUTCDay` (0 = dimanche). */
export const WEEKDAYS = [
  'dim.',
  'lun.',
  'mar.',
  'mer.',
  'jeu.',
  'ven.',
  'sam.',
];

/** Mêmes libellés réordonnés lundi → dimanche (en-tête de calendrier). */
export const WEEKDAYS_MONDAY_FIRST = [...WEEKDAYS.slice(1), WEEKDAYS[0]];

export function weekdayShort(day: string): string {
  return WEEKDAYS[
    new Date(
      Date.UTC(
        Number(day.slice(0, 4)),
        Number(day.slice(5, 7)) - 1,
        Number(day.slice(8, 10))
      )
    ).getUTCDay()
  ];
}

/** « mercredi 4 novembre 2026 » (jour civil, sans dépendre du fuseau). */
export function formatDayLong(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(
    new Date(
      Date.UTC(
        Number(day.slice(0, 4)),
        Number(day.slice(5, 7)) - 1,
        Number(day.slice(8, 10))
      )
    )
  );
}

const amountFormat = new Intl.NumberFormat('fr-FR');

/** Montant en francs CFA, ou tiret pour une valeur nulle. */
export const money = (n: number | null) =>
  n === null ? '—' : `${amountFormat.format(n)} F`;

const compactFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact' });

/** Montant abrégé (« 300 k ») pour les cases étroites du calendrier. */
export const compactMoney = (n: number) => compactFormat.format(n);
