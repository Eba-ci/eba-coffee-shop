'use client';

import { History, Pencil, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/fixed-costs/format';
import type { SalaryEmployeeRow } from '@/lib/salaries/admin-queries';

/** Ligne Employé : identité, taux courant et accès aux fiches. */
export function EmployeeRow({
  employee: e,
  onDetails,
  onRates,
  onEdit,
}: {
  employee: SalaryEmployeeRow;
  onDetails: () => void;
  onRates: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {e.name}
          {!e.active && <Badge variant="outline">Sorti</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          {e.position || 'Poste non renseigné'} · depuis {e.startDate}
          {e.endDate ? ` · jusqu’au ${e.endDate}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {e.rates[0]
            ? `Taux : ${money(e.rates[0].monthlyAmount)} depuis ${e.rates[0].startDate}`
            : 'Aucun taux défini'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          onClick={onDetails}
          aria-label={`Primes et retenues de ${e.name}`}
        >
          <Wallet className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          onClick={onRates}
          aria-label={`Historique des taux de ${e.name}`}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          onClick={onEdit}
          aria-label={`Modifier ${e.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
