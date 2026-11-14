// Fiche employé 360° en lecture (#440). Présentation pure : les six blocs sont
// alimentés par `getEmployee360`, qui rejoue le ledger unique de `lib/salaries`.
// Mobile d'abord : blocs empilés, cibles de navigation ≥ 44 px.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money } from '@/lib/fixed-costs/format';
import { monthLabel } from '@/lib/fixed-costs/month';
import {
  SALARY_PAYMENT_TYPE_LABELS,
  employmentLabel,
} from '@/lib/employees/format';
import type { Employee360 } from '@/lib/employees/queries';

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function IdentityCard({ employee }: { employee: Employee360 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identité</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1">
          <Field label="Nom" value={employee.name} />
          <Field
            label="Poste"
            value={employee.position || 'Poste non renseigné'}
          />
          <Field label="Entrée" value={employee.startDate} />
          <Field
            label="Sortie"
            value={employee.endDate ? employee.endDate : '—'}
          />
          <Field
            label="Statut"
            value={
              employee.active ? (
                <Badge variant="outline">En poste</Badge>
              ) : (
                <Badge variant="secondary">
                  {employmentLabel(employee.active, employee.endDate)}
                </Badge>
              )
            }
          />
          <Field label="Note" value={employee.note || '—'} />
        </dl>
      </CardContent>
    </Card>
  );
}

function CompensationCard({ employee }: { employee: Employee360 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rémunération</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
        {employee.rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun taux défini pour cet employé.
          </p>
        ) : (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Historique des taux
            </p>
            <ul className="mt-1 divide-y">
              {employee.rates.map((rate) => (
                <li
                  key={rate.startDate}
                  className="flex justify-between gap-3 py-1 text-sm"
                >
                  <span className="text-muted-foreground">
                    Depuis le {rate.startDate}
                  </span>
                  <span className="font-medium">
                    {money(rate.monthlyAmount)} / mois
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MonthCard({ employee }: { employee: Employee360 }) {
  const { month } = employee;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Situation de {monthLabel(month.month)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1">
          <Field label="Base (taux proratisés)" value={money(month.baseDue)} />
          <Field label="Primes" value={money(month.primes)} />
          <Field label="Retenues" value={money(month.retenues)} />
          <Field label="Dû du mois" value={money(month.due)} />
          <Field label="Salaires versés" value={money(month.salariesPaid)} />
          <Field label="Acomptes versés" value={money(month.advancesPaid)} />
          <Field
            label="Avances récupérées"
            value={money(month.advanceRecovered)}
          />
          <Field
            label="Reste à payer"
            value={<strong>{money(month.remainingToPay)}</strong>}
          />
          {month.overpaid > 0 && (
            <Field label="Excédent versé" value={money(month.overpaid)} />
          )}
        </dl>
        {month.remainingToPay > 0 ? (
          <Badge variant="secondary" className="mt-2">
            Mois non soldé
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-2">
            Soldé
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function ArrearsCard({ employee }: { employee: Employee360 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Arriéré</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <dl>
          <Field
            label="Total impayé (mois clôturés)"
            value={<strong>{money(employee.arrears.total)}</strong>}
          />
        </dl>
        {employee.arrears.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun mois clôturé impayé.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {employee.arrears.months.map((m) => (
              <li key={m.month} className="flex justify-between gap-3 py-1">
                <span className="text-muted-foreground">
                  {monthLabel(m.month)}
                </span>
                <span className="font-medium">{money(m.remaining)}</span>
              </li>
            ))}
          </ul>
        )}
        {employee.proposedPayment.total > 0 && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">
            Proposé au paiement :{' '}
            <strong>{money(employee.proposedPayment.total)}</strong>{' '}
            <span className="text-muted-foreground">
              (mois courant + arriéré, hors base du point mort)
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AdvanceCard({ employee }: { employee: Employee360 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solde d’avance</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <Field
            label="Avance restant à récupérer"
            value={<strong>{money(employee.advanceBalance)}</strong>}
          />
        </dl>
        {employee.advanceBalance === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Aucune avance à récupérer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ employee }: { employee: Employee360 }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Derniers versements</CardTitle>
      </CardHeader>
      <CardContent>
        {employee.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun versement enregistré.
          </p>
        ) : (
          <ul className="divide-y">
            {employee.payments.map((p) => (
              <li key={p.id} className="space-y-1 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">
                    {SALARY_PAYMENT_TYPE_LABELS[p.type]} · {monthLabel(p.month)}
                  </span>
                  <span className="font-semibold">{money(p.amount)}</span>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Le {p.date}</span>
                </p>
                {p.note && <p className="text-xs">{p.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeeDetail({ employee }: { employee: Employee360 }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard/employes">Retour à la liste</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <IdentityCard employee={employee} />
        <CompensationCard employee={employee} />
        <MonthCard employee={employee} />
        <ArrearsCard employee={employee} />
        <AdvanceCard employee={employee} />
        <PaymentsCard employee={employee} />
      </div>
    </div>
  );
}
