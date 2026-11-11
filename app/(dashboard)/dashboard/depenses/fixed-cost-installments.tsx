'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FixedCostPeriodicityValue } from '@/lib/schemas/fixed-cost';

/** Une échéance en cours de saisie (valeurs de formulaire, chaînes). */
export type InstallmentDraft = {
  /** Décalage en mois : trimestre 0..2, année 0..11, sinon 0. */
  monthOffset: string;
  /** Mensuel+ : jour du mois 1..31. Hebdo : jour 1 (lun)..7 (dim). */
  day: string;
  amount: string;
};

const WEEKDAYS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

const selectClass =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

const fmt = new Intl.NumberFormat('fr-FR');

/**
 * Saisie des jours de paiement d'une charge : un ou plusieurs jours dans la
 * période, avec le montant de chaque échéance. Vide = échéance par défaut
 * (le jour de la prise d'effet). Le total doit égaler le montant de la charge
 * (vérifié côté serveur).
 */
export function FixedCostInstallments({
  periodicity,
  amount,
  startDate,
  installments,
  onChange,
}: {
  periodicity: FixedCostPeriodicityValue;
  amount: number;
  startDate: string;
  installments: InstallmentDraft[];
  onChange: (installments: InstallmentDraft[]) => void;
}) {
  const isWeekly = periodicity === 'WEEKLY';
  const showMonth = periodicity === 'QUARTERLY' || periodicity === 'YEARLY';
  const monthCount = periodicity === 'YEARLY' ? 12 : 3;
  const total = installments.reduce(
    (s, i) => s + (Math.round(Number(i.amount)) || 0),
    0
  );
  const startDay = Number(startDate.slice(8, 10)) || 1;

  const patch = (index: number, key: keyof InstallmentDraft, value: string) =>
    onChange(
      installments.map((it, i) => (i === index ? { ...it, [key]: value } : it))
    );

  function add() {
    const fresh: InstallmentDraft =
      installments.length === 0
        ? { monthOffset: '0', day: String(startDay), amount: String(amount) }
        : { monthOffset: '0', day: '', amount: '' };
    onChange([...installments, fresh]);
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Jours de paiement</p>
          <p className="text-xs text-muted-foreground">
            {installments.length === 0
              ? 'Sans échéance : le paiement tombe le jour de la prise d’effet.'
              : `Total des échéances : ${fmt.format(total)} F sur ${fmt.format(amount)} F`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          onClick={add}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Ajouter une échéance
        </Button>
      </div>

      {installments.map((it, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          {showMonth && (
            <div className="space-y-1">
              <Label htmlFor={`fc-inst-m-${i}`} className="text-xs">
                Mois
              </Label>
              <select
                id={`fc-inst-m-${i}`}
                className={selectClass}
                value={it.monthOffset}
                onChange={(e) => patch(i, 'monthOffset', e.target.value)}
              >
                {Array.from({ length: monthCount }, (_, m) => (
                  <option key={m} value={m}>
                    {periodicity === 'YEARLY' ? MONTHS[m] : `Mois ${m + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`fc-inst-d-${i}`} className="text-xs">
              {isWeekly ? 'Jour' : 'Jour du mois'}
            </Label>
            {isWeekly ? (
              <select
                id={`fc-inst-d-${i}`}
                className={selectClass}
                value={it.day}
                onChange={(e) => patch(i, 'day', e.target.value)}
              >
                {WEEKDAYS.map((w, wi) => (
                  <option key={wi} value={wi + 1}>
                    {w}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`fc-inst-d-${i}`}
                className="h-11 w-24"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                value={it.day}
                onChange={(e) => patch(i, 'day', e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`fc-inst-a-${i}`} className="text-xs">
              Montant (F)
            </Label>
            <Input
              id={`fc-inst-a-${i}`}
              className="h-11 w-32"
              type="number"
              min={1}
              inputMode="numeric"
              value={it.amount}
              onChange={(e) => patch(i, 'amount', e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => onChange(installments.filter((_, j) => j !== i))}
            aria-label="Retirer cette échéance"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}
