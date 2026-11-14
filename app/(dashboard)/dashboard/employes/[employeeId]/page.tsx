// Fiche employé 360° (#440/#442/#450) — lecture ADMIN + COMPTABLE. Le header de
// la page (titre, sous-titre, actions ADMIN) vit ici ; la fiche est la
// présentation des sections, alimentée par `getEmployee360`. Aucun champ de
// saisie : les écritures passent par les tiroirs de l'en-tête (y compris primes
// et avances, ADMIN uniquement).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePayroll } from '@/lib/auth-helpers';
import { getEmployee360 } from '@/lib/employees/queries';
import {
  listSalaryAdvances,
  listSalaryEmployees,
} from '@/lib/salaries/admin-lists';
import { todayDateString } from '@/lib/timezone';
import { EmployeeDetail } from './_components/employee-detail';
import { EmployeeDetailActions } from '../_components/employee-detail-actions';
import { EmployeeSalaryActions } from '../_components/employee-salary-actions';
import { PageHeader } from '../_components/page-header';

export const dynamic = 'force-dynamic';

export default async function EmployeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const session = await requirePayroll();
  const today = todayDateString();
  const month = today.slice(0, 7);
  const employee = await getEmployee360(employeeId, month);
  if (!employee) notFound();

  const isAdmin = session.user.role === 'ADMIN';
  const [salaryRow, employeeAdvances] = isAdmin
    ? await Promise.all([
        listSalaryEmployees(month).then(
          (rows) => rows.find((row) => row.id === employeeId) ?? null
        ),
        listSalaryAdvances().then((rows) =>
          rows.filter((row) => row.employeeId === employeeId)
        ),
      ])
    : [null, []];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/dashboard/employes"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Employés
        </Link>
        <PageHeader
          title={employee.name}
          subtitle={employee.position || 'Poste non renseigné'}
          action={
            isAdmin ? (
              <>
                <EmployeeDetailActions employee={employee} today={today} />
                <EmployeeSalaryActions
                  employee={salaryRow}
                  advances={employeeAdvances}
                  today={today}
                />
              </>
            ) : undefined
          }
        />
      </div>
      <EmployeeDetail employee={employee} />
    </div>
  );
}