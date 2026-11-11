'use client';

import { useState, useTransition } from 'react';
import { Download, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  FIXED_COST_PERIODICITY_LABELS,
  type FixedCostPeriodicityValue,
} from '@/lib/schemas/fixed-cost';
import { FixedCostFields, emptyDraft, type Draft } from './fixed-cost-fields';
import {
  createFixedCostAction,
  deleteFixedCostAction,
  syncFixedCostsAction,
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
  linked: boolean;
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
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft(categories[0]?.id ?? '')
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function reset() {
    setEditingId(null);
    setDraft(emptyDraft(categories[0]?.id ?? ''));
  }

  function submit() {
    const amount = Math.round(Number(draft.amount));
    if (!draft.label.trim() || !(amount > 0)) {
      setError('Libellé et montant requis');
      return;
    }
    if (!draft.categoryId) {
      setError('Choisis une catégorie');
      return;
    }
    setError(null);
    setInfo(null);
    const payload = {
      label: draft.label,
      amount,
      periodicity: draft.periodicity,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      categoryId: draft.categoryId,
      installments: draft.installments.map((i) => ({
        monthOffset: Number(i.monthOffset) || 0,
        day: Math.round(Number(i.day)),
        amount: Math.round(Number(i.amount)),
      })),
    };
    startTransition(async () => {
      const r = editingId
        ? await updateFixedCostAction(editingId, payload)
        : await createFixedCostAction(payload);
      if (!r.ok) setError(r.error);
      else reset();
    });
  }

  function edit(row: FixedCostManagerRow) {
    setEditingId(row.id);
    setError(null);
    setDraft({
      label: row.label,
      amount: String(row.amount),
      periodicity: row.periodicity,
      startDate: row.startDate,
      endDate: row.endDate ?? '',
      categoryId: row.categoryId,
      installments: row.installments.map((i) => ({
        monthOffset: String(i.monthOffset),
        day: String(i.day),
        amount: String(i.amount),
      })),
    });
  }

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
      const r = await syncFixedCostsAction();
      if (!r.ok) return setError(r.error);
      const parts = [`${r.created} charge(s) importée(s)`];
      if (r.skippedNoAmount.length > 0)
        parts.push(
          `sans montant, à compléter dans « Récurrentes » : ${r.skippedNoAmount.join(', ')}`
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chaque charge est répartie sur les jours ouverts de sa période (selon
        tes horaires) : un jour fermé ne porte aucune charge.
      </p>

      <Button
        size="sm"
        variant="outline"
        onClick={sync}
        disabled={pending}
        className="h-11 sm:h-9"
      >
        <Download className="mr-1.5 h-4 w-4" />
        Importer depuis les récurrentes
      </Button>

      <FixedCostFields draft={draft} set={set} categories={categories} />

      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={pending}
          size="sm"
          className="h-11 sm:h-9"
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          {editingId ? 'Enregistrer' : 'Ajouter'}
        </Button>
        {editingId && (
          <Button
            onClick={reset}
            variant="ghost"
            size="sm"
            className="h-11 sm:h-9"
          >
            <X className="mr-1.5 h-4 w-4" />
            Annuler
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-muted-foreground">{info}</p>}

      {costs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune charge fixe définie.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {costs.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmt.format(c.amount)} F ·{' '}
                  {FIXED_COST_PERIODICITY_LABELS[c.periodicity].toLowerCase()}
                  {' · '}dès le {c.startDate}
                  {c.endDate ? ` jusqu’au ${c.endDate}` : ''} · {c.categoryName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
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
                  onClick={() => edit(c)}
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
    </div>
  );
}
