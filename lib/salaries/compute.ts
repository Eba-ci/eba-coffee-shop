// lib/salaries/compute.ts
//
// Point d'entrée PUBLIC des règles PURES de calcul des salaires — rien ici ne
// touche la base : employé, taux et versements sont passés en paramètre
// (testable, isomorphe).
//
// Principes :
// - le salaire dû d'un mois est proratisé au JOUR CALENDAIRE : chaque montant
//   mensuel se répartit sur les jours du mois, et un changement de taux, une
//   entrée ou une sortie en cours de mois ne retiennent que les jours concernés.
//   L'arrondi au FCFA entier se fait par plus fort reste (`roundToWholeFcfa`),
//   de sorte que la somme des segments retombe sur l'arrondi du total exact ;
// - un ACOMPTE est une avance sur le salaire DU MOIS : il se déduit du dû du
//   mois auquel il est rattaché ;
// - une AVANCE est un prêt : son solde est récupéré automatiquement sur les
//   paies SUIVANTES (`recoveryMonths` étale la récupération), et le reliquat
//   qu'un mois n'a pas pu absorber est reporté au mois d'après.
//
// L'implémentation est scindée pour rester lisible (`types.ts`, `due.ts`,
// `ledger.ts`) ; ce fichier en est le point d'entrée stable.

export * from './types';
export { salaryArrears, salaryPaymentProposal } from './arrears';
export { employmentWindow, salaryDueForMonth } from './due';
export {
  advanceRecoverySchedule,
  salaryLedger,
  salaryLedgerThrough,
  summarizeSalaryMonth,
} from './ledger';
