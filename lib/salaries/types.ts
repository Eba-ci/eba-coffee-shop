// lib/salaries/types.ts
//
// Types des entrées « likes » (employé, taux, versement) et des sorties du
// calcul des salaires. Aucune dépendance à Prisma ni à la base : les règles
// pures reçoivent ces formes minimales, ce qui les rend testables et
// isomorphes.

import type { SalaryPaymentType } from '@/generated/prisma/enums';

export type SalaryRateLike = {
  monthlyAmount: number; // FCFA/mois
  startDate: string; // prise d'effet, incluse (YYYY-MM-DD)
};

export type EmployeeLike = {
  startDate: string; // date d'entrée (YYYY-MM-DD)
  endDate: string | null; // date de sortie, incluse (null = en poste)
};

export type SalaryPaymentLike = {
  month: string; // mois concerné "YYYY-MM"
  type: SalaryPaymentType;
  amount: number; // FCFA
  recoveryMonths?: number; // AVANCE : étalement (défaut 1)
};

export type SalarySegment = {
  rateStartDate: string;
  monthlyAmount: number;
  days: number;
  amount: number;
};

export type SalaryDue = {
  month: string;
  due: number; // salaire dû du mois, FCFA entiers
  daysEmployed: number; // jours d'emploi dans le mois (0 = pas employé)
  daysWithoutRate: number; // jours d'emploi sans AUCUN taux défini (dû 0)
  segments: SalarySegment[]; // un segment par taux appliqué
};

export type AdvanceLike = {
  month: string; // mois du versement de l'avance
  amount: number; // FCFA
  recoveryMonths?: number; // nombre de mois d'étalement (défaut 1)
};

export type AdvanceRecovery = { month: string; amount: number };

export type SalaryMonthSummary = {
  month: string;
  due: number; // salaire dû du mois
  salariesPaid: number; // SALAIRE versés pour ce mois
  advancesPaid: number; // ACOMPTE versés pour ce mois (avance sur le mois)
  advanceGiven: number; // AVANCE versées pendant ce mois
  advanceRecovered: number; // solde d'avance récupéré sur ce mois
  remainingToPay: number; // dû − versements − avances récupérées (borné à 0)
  overpaid: number; // excédent versé au-delà du dû (0 si rien de trop)
  advanceBalance: number; // solde d'avance restant après ce mois
};
