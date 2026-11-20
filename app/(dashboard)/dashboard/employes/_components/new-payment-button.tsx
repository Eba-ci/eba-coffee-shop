'use client';

// Action d'en-tête « Nouveau versement » (#466) : ouvre le tiroir de versement
// existant, sans poser de champ sur la liste. Réservé à l'ADMIN : la page ne
// monte ce bouton que pour lui.

import type { PaymentSituation } from '@/lib/salaries/partial-warning';
import { SalaryPaymentDrawer } from './paie/payment-drawer';

export function NewPaymentButton({
  employees,
  month,
  today,
  situations,
}: {
  employees: { id: string; name: string }[];
  month: string;
  today: string;
  situations?: Record<string, PaymentSituation>;
}) {
  return (
    <SalaryPaymentDrawer
      employees={employees}
      defaultMonth={month}
      today={today}
      situations={situations}
      triggerVariant="outline"
    />
  );
}
