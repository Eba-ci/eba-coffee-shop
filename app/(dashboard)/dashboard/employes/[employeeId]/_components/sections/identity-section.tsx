// « Identité » (#442) : la fiche administrative, volontairement en dernier —
// elle est consultée moins souvent que la situation de paie.

import { employmentLabel } from '@/lib/employees/format';
import type { Employee360 } from '@/lib/employees/queries';
import { EmployeeAvatar } from '../../../_components/employee-avatar';
import { EmploymentBadge } from '../../../_components/employee-badges';
import { Field, SectionCard } from './section-card';

export function IdentitySection({ employee }: { employee: Employee360 }) {
  return (
    <SectionCard
      title="Identité"
      description="État civil professionnel, dates d'entrée et de sortie."
    >
      <div className="flex items-center gap-3">
        <EmployeeAvatar name={employee.name} />
        <div className="min-w-0">
          <p className="font-medium">{employee.name}</p>
          <p className="text-xs text-muted-foreground">
            {employmentLabel(employee.active, employee.endDate)}
          </p>
        </div>
      </div>
      <dl className="space-y-1.5 border-t pt-3">
        <Field label="Nom" value={employee.name} />
        <Field
          label="Poste"
          value={employee.position || 'Poste non renseigné'}
        />
        <Field label="Entrée" value={employee.startDate} />
        <Field label="Sortie" value={employee.endDate ?? '—'} />
        <Field
          label="Statut"
          value={
            <EmploymentBadge
              active={employee.active}
              endDate={employee.endDate}
            />
          }
        />
        <Field label="Note" value={employee.note || '—'} />
      </dl>
    </SectionCard>
  );
}
