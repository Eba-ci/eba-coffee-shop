'use client';

import { useState } from 'react';
import { Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { maxSplitCount, splitInstallments } from '@/lib/fixed-costs/split';
import type { FixedCostPeriodicityValue } from '@/lib/schemas/fixed-cost';
import type { InstallmentDraft } from './fixed-cost-installments';

/**
 * « Fractionner le montant » : propose N échéances dont la somme égale le
 * montant de la charge, au franc près. Chaque échéance reste modifiable ; le
 * même bouton remet la répartition proposée.
 */
export function FixedCostSplit({
  periodicity,
  amount,
  startDay,
  hasInstallments,
  onApply,
}: {
  periodicity: FixedCostPeriodicityValue;
  amount: number;
  startDay: number;
  hasInstallments: boolean;
  onApply: (installments: InstallmentDraft[]) => void;
}) {
  const max = maxSplitCount(periodicity);
  const [count, setCount] = useState('4');
  if (max < 2 || !(amount > 0)) return null;
  const n = Math.min(Math.max(Math.round(Number(count)) || 2, 2), max);

  function apply() {
    onApply(
      splitInstallments(periodicity, amount, n, startDay).map((i) => ({
        monthOffset: String(i.monthOffset),
        day: String(i.day),
        amount: String(i.amount),
      }))
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="fc-split-count" className="text-xs">
          Nombre d’échéances (2 à {max})
        </Label>
        <Input
          id="fc-split-count"
          className="h-11 w-24"
          type="number"
          min={2}
          max={max}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <Button type="button" variant="outline" className="h-11" onClick={apply}>
        <Split className="mr-1.5 h-4 w-4" />
        {hasInstallments ? 'Remettre la répartition' : 'Fractionner le montant'}
      </Button>
    </div>
  );
}
