// Page « Employés » (#440) — ADMIN + COMPTABLE. La garde est posée ici ET dans
// chaque lecture (`lib/employees/queries.ts`) : la page ne rend rien tant que
// la session n'a pas le rôle, et aucune donnée nominative n'est chargée avant.
// Écritures (#441) : uniquement ADMIN, via le tiroir « Nouvel employé ».

import { requirePayroll } from '@/lib/auth-helpers';
import { listEmployeesOverview } from '@/lib/employees/queries';
import { todayDateString } from '@/lib/timezone';
import { EmployeesList } from './_components/employees-list';
import { NewEmployeeButton } from './_components/new-employee-button';
import { PageHeader } from './_components/page-header';

export const dynamic = 'force-dynamic';

export default async function EmployesPage() {
  await requirePayroll();
  const today = todayDateString();
  const overview = await listEmployeesOverview(today.slice(0, 7));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employés"
        subtitle="Effectif, rémunération et situation du mois."
        action={<NewEmployeeButton today={today} />}
      />
      <EmployeesList overview={overview} today={today} />
    </div>
  );
}
