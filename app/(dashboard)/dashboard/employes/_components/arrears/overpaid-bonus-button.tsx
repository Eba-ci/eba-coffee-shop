'use client';

// Trop-perçu d'un mois : jamais reporté sur le suivant. Le bouton le qualifie en
// prime (« bonus ») : le dû du mois monte du même montant, le versement ne bouge
// pas. Confirmation par un second appui (pas de dialogue modal pour un geste
// aussi léger).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { convertOverpaymentToBonusAction } from '../../salary-actions';
import { FieldError } from '../employee-sheet';

export function OverpaidBonusButton({
  employeeId,
  month,
  overpaid,
}: {
  employeeId: string;
  month: string;
  overpaid: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await convertOverpaymentToBonusAction({ employeeId, month });
      if (r.ok) router.refresh();
      else setError(r.error);
      setConfirm(false);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
      <p>
        Trop-perçu en {monthLabel(month)} :{' '}
        <span className="font-semibold tabular-nums">{money(overpaid)}</span>
        <span className="block text-xs text-muted-foreground">
          Il n’est pas reporté sur le mois suivant. Vous pouvez le qualifier en
          bonus.
        </span>
      </p>
      <Button
        type="button"
        variant={confirm ? 'default' : 'outline'}
        className="h-11"
        disabled={pending}
        onClick={() => (confirm ? run() : setConfirm(true))}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Gift className="size-4" />
        )}
        {confirm
          ? `Confirmer le bonus de ${money(overpaid)}`
          : 'Marquer comme bonus'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
