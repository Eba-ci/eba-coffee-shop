// « Derniers versements » (#442) : une ligne par versement, montant aligné à
// droite, secondaire en gris. L'historique n'est jamais effacé (annulés
// compris côté données).

import { cn } from '@/lib/utils';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import { SALARY_PAYMENT_TYPE_LABELS } from '@/lib/employees/format';
import type { Employee360 } from '@/lib/employees/queries';
import { CancelPaymentButton } from './cancel-payment-button';
import { SectionCard } from './section-card';

export function PaymentsSection({
  employee,
  canCancel = false,
}: {
  employee: Employee360;
  canCancel?: boolean;
}) {
  return (
    <SectionCard
      title="Derniers versements"
      description="Salaires, acomptes et avances enregistrés, du plus récent au plus ancien."
    >
      {employee.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun versement enregistré pour cet employé.
        </p>
      ) : (
        <ul className="divide-y">
          {employee.payments.map((payment) => (
            <li key={payment.id} className="py-2.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn('min-w-0', payment.canceledAt && 'opacity-60')}
                >
                  <p
                    className={cn(
                      'font-medium',
                      payment.canceledAt && 'line-through'
                    )}
                  >
                    {SALARY_PAYMENT_TYPE_LABELS[payment.type]}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {monthLabel(payment.month)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Le {payment.date}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </p>
                  {payment.canceledAt && (
                    <p className="text-xs font-medium text-destructive">
                      Annulé le {payment.canceledAt}
                      {payment.cancelReason ? ` · ${payment.cancelReason}` : ''}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    payment.canceledAt && 'text-muted-foreground line-through'
                  )}
                >
                  {money(payment.amount)}
                </span>
              </div>
              {canCancel && !payment.canceledAt && (
                <CancelPaymentButton paymentId={payment.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
