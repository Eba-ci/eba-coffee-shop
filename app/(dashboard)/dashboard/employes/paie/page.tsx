// Paie du mois (#442/#450) — ADMIN + COMPTABLE. Même en-tête partagé que la
// liste et la fiche ; le mois vit dans l'URL (`?mois=YYYY-MM`, nuqs) et la
// lecture est faite côté serveur par `getSalaryMonthView` (aucun calcul ici).
// Aucun champ de saisie sur la page : les actions viendront de l'en-tête sous
// forme de tiroir (règle des écrans Employés).

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { requirePayroll } from '@/lib/auth-helpers';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel, parseMonth } from '@/lib/fixed-costs/month';
import { getSalaryMonthView } from '@/lib/salaries/admin-queries';
import { todayDateString } from '@/lib/timezone';
import { NewPaymentButton } from '../_components/new-payment-button';
import { SalairesMonthNav } from '../_components/paie/month-nav';
import { SalaryMonthView } from '../_components/paie/month-view';
import { PageHeader } from '../_components/page-header';
import { loadPaieParams } from '../_components/paie/search-params';

export const dynamic = 'force-dynamic';

function Stat({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`mt-1 tabular-nums ${strong ? 'text-xl font-semibold' : 'text-lg font-medium'}`}
        >
          {money(value)}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function PaiePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePayroll();
  const isAdmin = session.user.role === 'ADMIN';
  const today = todayDateString();
  const currentMonth = today.slice(0, 7);
  const params = await searchParams;
  const month = parseMonth(loadPaieParams(params).mois, today);
  const view = await getSalaryMonthView(month);
  const { totals } = view;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paie du mois"
        subtitle={`Situation de ${monthLabel(month)}, employé par employé.`}
        action={
          <>
            <Button asChild variant="outline" className="h-11">
              <Link href="/dashboard/employes">
                <Wallet className="size-4" aria-hidden="true" />
                Employés
              </Link>
            </Button>
            {isAdmin && (
              <NewPaymentButton
                employees={view.employees
                  .filter((employee) => employee.active)
                  .map((employee) => ({
                    id: employee.employeeId,
                    name: employee.name,
                  }))}
                month={month}
                today={today}
              />
            )}
          </>
        }
      />

      <SalairesMonthNav month={month} currentMonth={currentMonth} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Dû du mois" value={totals.due} />
        <Stat
          label="Versé"
          value={
            totals.salariesPaid + totals.advancesPaid + totals.advanceRecovered
          }
          hint="Salaires, acomptes et avances récupérées"
        />
        <Stat
          label="Reste à payer"
          value={totals.remainingToPay}
          strong
          hint={totals.arrearsTotal > 0 ? 'Arriéré compris ci-dessous' : 'Mois'}
        />
        <Stat
          label="Arriéré"
          value={totals.arrearsTotal}
          hint={totals.arrearsTotal > 0 ? 'Mois clôturés' : 'À jour'}
        />
      </div>

      <SalaryMonthView view={view} />
    </div>
  );
}