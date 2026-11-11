// Ligne unique « Salaires du mois : X F » — le total GLOBAL des salaires d'un
// mois, affiché aux rôles non-admin (et à l'admin) sans aucun détail : ni nom,
// ni ventilation, ni nombre d'employés. Le seul accès aux données est
// `getMonthlySalaryTotal`, qui renvoie un nombre.
//
// Elle est rendue une fois en tête de la page Dépenses : elle apparaît donc
// aussi bien sur l'onglet « Point mort » que sur le « Calendrier des
// paiements », sans être dupliquée.

import { Wallet } from 'lucide-react';
import { money } from '@/lib/fixed-costs/format';
import { getMonthlySalaryTotal } from '@/lib/salaries/queries';

export async function SalairesGlobalLine({ month }: { month: string }) {
  const total = await getMonthlySalaryTotal(month);
  return (
    <p className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        Salaires du mois :{' '}
        <span className="font-semibold tabular-nums">{money(total)}</span>
      </span>
    </p>
  );
}
