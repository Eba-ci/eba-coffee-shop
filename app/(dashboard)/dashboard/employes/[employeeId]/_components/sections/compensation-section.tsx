// « Rémunération » (#442) : taux en vigueur puis frise chronologique des
// changements (jamais écrasés : une étape par taux datée). Mobile d'abord : une
// colonne, ligne verticale à gauche, montants en `tabular-nums`. La couleur ne
// porte jamais l'information seule (signe + libellé « hausse » / « baisse »).

import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { money } from '@/lib/fixed-costs/format';
import type { Employee360 } from '@/lib/employees/queries';
import { buildRateTimeline, type RateStep } from '@/lib/salaries/rate-timeline';
import { cn } from '@/lib/utils';
import { Field, SectionCard } from './section-card';

const dateFr = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function period(step: RateStep): string {
  if (step.upcoming) return `À partir du ${dateFr(step.startDate)}`;
  return step.endDate
    ? `Du ${dateFr(step.startDate)} au ${dateFr(step.endDate)}`
    : `Depuis le ${dateFr(step.startDate)}`;
}

function Delta({ step }: { step: RateStep }) {
  if (step.delta === null) {
    return <span className="text-xs text-muted-foreground">Taux initial</span>;
  }
  const up = step.delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? 'Hausse' : 'Baisse'} de {up ? '+' : '−'}
      {money(Math.abs(step.delta))}
      {step.deltaPct !== null &&
        ` (${up ? '+' : '−'}${Math.abs(step.deltaPct)} %)`}
    </span>
  );
}

export function CompensationSection({
  employee,
  today,
}: {
  employee: Employee360;
  today?: string;
}) {
  const steps = buildRateTimeline(
    employee.rates,
    employee.endDate,
    today ?? new Date().toISOString().slice(0, 10)
  );
  return (
    <SectionCard
      title="Rémunération"
      description="Montant mensuel applicable et frise de ses changements."
    >
      <dl>
        <Field
          label="Taux en vigueur"
          value={
            employee.currentRate === null
              ? 'Aucun taux'
              : `${money(employee.currentRate)} / mois`
          }
        />
      </dl>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun taux défini : le dû de cet employé est de 0 F.
        </p>
      ) : (
        <ol
          aria-label="Frise des taux"
          className="relative ml-2 space-y-4 border-l pl-5"
        >
          {[...steps].reverse().map((step) => (
            <li key={step.startDate} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-1.5 -left-[27px] size-3 rounded-full border-2 bg-background',
                  step.current && 'border-primary bg-primary',
                  step.upcoming && 'border-dashed'
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium tabular-nums">
                  {money(step.monthlyAmount)} / mois
                </span>
                {step.current && (
                  <span className="text-xs font-medium text-primary">
                    En vigueur
                  </span>
                )}
                {step.upcoming && (
                  <span className="text-xs text-muted-foreground">À venir</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{period(step)}</p>
              <Delta step={step} />
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
