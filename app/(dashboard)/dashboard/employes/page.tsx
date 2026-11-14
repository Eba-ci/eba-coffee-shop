// Page « Employés » (#440) — ADMIN + COMPTABLE. La garde est posée ici ET dans
// chaque lecture (`lib/employees/queries.ts`) : la page ne rend rien tant que
// la session n'a pas le rôle, et aucune donnée nominative n'est chargée avant.

import { requirePayroll } from '@/lib/auth-helpers';
import { listEmployeesOverview } from '@/lib/employees/queries';
import { todayDateString } from '@/lib/timezone';
import { EmployeesList } from './_components/employees-list';

export const dynamic = 'force-dynamic';

export default async function EmployesPage() {
  await requirePayroll();
  const overview = await listEmployeesOverview(todayDateString().slice(0, 7));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employés</h1>
        <p className="text-sm text-muted-foreground">
          Effectif, rémunération et situation du mois. Touche un employé pour
          ouvrir sa fiche 360°.
        </p>
      </div>
      <EmployeesList overview={overview} />
    </div>
  );
}
