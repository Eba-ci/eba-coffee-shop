// Fiche employé 360° (#440) — ADMIN + COMPTABLE. Même garde que la liste : la
// page refuse avant lecture, et `getEmployee360` re-vérifie le rôle avant
// d'atteindre la base. Un id inconnu tombe sur `notFound()`.

import { notFound } from 'next/navigation';
import { requirePayroll } from '@/lib/auth-helpers';
import { getEmployee360 } from '@/lib/employees/queries';
import { todayDateString } from '@/lib/timezone';
import { EmployeeDetail } from './_components/employee-detail';

export const dynamic = 'force-dynamic';

export default async function EmployeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  await requirePayroll();
  const employee = await getEmployee360(
    employeeId,
    todayDateString().slice(0, 7)
  );
  if (!employee) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{employee.name}</h1>
        <p className="text-sm text-muted-foreground">
          {employee.position || 'Poste non renseigné'}
        </p>
      </div>
      <EmployeeDetail employee={employee} />
    </div>
  );
}
