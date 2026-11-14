// Page « Employés » (#440) — ADMIN + COMPTABLE. La garde est posée ici ET dans
// chaque lecture (`lib/employees/queries.ts`) : la page ne rend rien tant que
// la session n'a pas le rôle, et aucune donnée nominative n'est chargée avant.
// Écritures (#441) : uniquement ADMIN, via le tiroir « Nouvel employé ».

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requirePayroll } from '@/lib/auth-helpers';
import { listEmployeesOverview } from '@/lib/employees/queries';
import { todayDateString } from '@/lib/timezone';
import { EmployeesList } from './_components/employees-list';
import { NewEmployeeButton } from './_components/new-employee-button';
import { PageHeader } from './_components/page-header';

export const dynamic = 'force-dynamic';

export default async function EmployesPage() {
  const session = await requirePayroll();
  const isAdmin = session.user.role === 'ADMIN';
  const today = todayDateString();
  const overview = await listEmployeesOverview(today.slice(0, 7));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employés"
        subtitle="Effectif, rémunération et situation du mois."
        action={
          <>
            <Button asChild variant="outline" className="h-11">
              <Link href="/dashboard/employes/paie">
                <Wallet className="size-4" aria-hidden="true" />
                Paie du mois
              </Link>
            </Button>
            {isAdmin && <NewEmployeeButton today={today} />}
          </>
        }
      />
      <EmployeesList overview={overview} today={today} canWrite={isAdmin} />
    </div>
  );
}
