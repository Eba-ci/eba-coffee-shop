// Fiche employé 360° (#440) — lecture ADMIN + COMPTABLE. Le header de la page
// (titre, sous-titre, actions ADMIN #441) vit dans `page.tsx` ; cette fiche est
// la présentation des six blocs, alimentés par `getEmployee360`. Aucun champ de
// saisie ici : les écritures passent par les tiroirs de l'en-tête.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePayroll } from '@/lib/auth-helpers';
import { getEmployee360 } from '@/lib/employees/queries';
import { todayDateString } from '@/lib/timezone';
import { EmployeeDetail } from './_components/employee-detail';
import { EmployeeDetailActions } from '../_components/employee-detail-actions';
import { PageHeader } from '../_components/page-header';

export const dynamic = 'force-dynamic';

export default async function EmployeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  await requirePayroll();
  const today = todayDateString();
  const employee = await getEmployee360(employeeId, today.slice(0, 7));
  if (!employee) notFound();

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
          action={<EmployeeDetailActions employee={employee} today={today} />}
        />
      </div>
      <EmployeeDetail employee={employee} />
    </div>
  );
}
