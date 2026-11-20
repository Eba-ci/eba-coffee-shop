'use client';

import { useState, useTransition } from 'react';
import { Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  FIXED_COST_PERIODICITY_LABELS,
  type FixedCostPeriodicityValue,
} from '@/lib/schemas/fixed-cost';
import { FixedCostSheet, type FixedCostSheetTarget } from './fixed-cost-sheet';
import {
  deleteFixedCostAction,
  syncFixedCostsFromCategoriesAction,
  updateFixedCostAction,
} from './actions';

export type FixedCostManagerRow = {
  id: string;
  label: string;
  amount: number;
  periodicity: FixedCostPeriodicityValue;
  startDate: string;
  endDate: string | null;
  active: boolean;
  categoryId: string;
  categoryName: string;
  note: string | null;
  /** Vide = échéance par défaut déduite de la prise d'effet. */
  installments: { monthOffset: number; day: number; amount: number }[];
};

const fmt = new Intl.NumberFormat('fr-FR');
export function FixedCostManager({
  costs,
  categories,
}: {
  costs: FixedCostManagerRow[];
  categories: { id: string; name: string }[];
}) {
  const [target, setTarget] = useState<FixedCostSheetTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Erreur');
    });
  }

  function sync() {
    setError(null);
    startTransition(async () => {
      const r = await syncFixedCostsFromCategoriesAction();
      if (!r.ok) return setError(r.error);
      const parts = [
        `${r.created} charge(s) créée(s)`,
        `${r.alreadyLinked} déjà liée(s)`,
      ];
      if (r.toComplete.length > 0)
        parts.push(
          `à compléter (aucun montant connu, à créer avec son montant et ses jours de paiement) : ${r.toComplete.join(', ')}`
        );
      if (r.skippedSalary.length > 0)
        parts.push(
          `« Salaires » ignorée (rubrique Salaires) : ${r.skippedSalary.join(', ')}`
        );
      setInfo(parts.join(' — '));
    });
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Crée d’abord une catégorie de dépense pour définir une charge fixe.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          Chaque charge est répartie sur les jours ouverts de sa période (selon
          tes horaires) : un jour fermé ne porte aucune charge.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={sync}
            disabled={pending}
            className="h-11 sm:h-9"
          >
            <Download className="h-4 w-4" />
            Importer les catégories fixes
          </Button>
          <Button
            size="sm"
            onClick={() => setTarget({ mode: 'create' })}
            disabled={pending}
            className="h-11 sm:h-9"
          >
            <Plus className="h-4 w-4" />
            Nouvelle charge
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {info && <p className="text-sm text-muted-foreground">{info}</p>}

      {costs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Aucune charge fixe définie pour l’instant.
          </p>
          <Button
            size="sm"
            onClick={() => setTarget({ mode: 'create' })}
            disabled={pending}
            className="h-11 sm:h-9"
          >
            <Plus className="h-4 w-4" />
            Nouvelle charge
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {costs.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{c.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.categoryName} ·{' '}
                  {FIXED_COST_PERIODICITY_LABELS[c.periodicity].toLowerCase()}
                  {' · '}dès le {c.startDate}
                  {c.endDate ? ` jusqu’au ${c.endDate}` : ''}
                </p>
                {c.note && (
                  <p className="truncate text-xs text-muted-foreground">
                    {c.note}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-1 sm:justify-end">
                <span className="mr-1 text-sm font-medium tabular-nums">
                  {fmt.format(c.amount)} F
                </span>
                <Switch
                  checked={c.active}
                  onCheckedChange={() =>
                    run(() =>
                      updateFixedCostAction(c.id, { active: !c.active })
                    )
                  }
                  aria-label={c.active ? 'Désactiver' : 'Activer'}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => setTarget({ mode: 'edit', id: c.id, row: c })}
                  disabled={pending}
                  aria-label="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  onClick={() => run(() => deleteFixedCostAction(c.id))}
                  disabled={pending}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FixedCostSheet
        target={target}
        categories={categories}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
