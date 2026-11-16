'use client';

// Rapprochement dépense ↔ échéance (#453) : propositions à confirmer, liaison
// manuelle, déliaison. Rien n'est lié sans clic ; un lot confirmé est atomique
// (une erreur annule tout). Le statut de l'échéance se recalcule côté serveur.

import { useState, useTransition } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { Button } from '@heroui/react';
import { formatDay, money } from '@/lib/fixed-costs/format';
import type { ReconciliationView } from '@/lib/fixed-costs/links-queries';
import { linkExpensesAction, unlinkExpensesAction } from '../../actions-links';

const selectClass =
  'h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:h-9';

type Target = { expenseId: string; costId: string; dueDate: string };

const signed = (n: number) =>
  n === 0 ? 'montant identique' : `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`;

export function ReconciliationPanel({
  view,
  readOnly,
}: {
  view: ReconciliationView;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [manual, setManual] = useState<Record<string, string>>({});

  const occByKey = new Map(
    view.occurrences.map((o) => [`${o.costId}|${o.dueDate}`, o])
  );
  const expenseById = new Map(view.unlinked.map((e) => [e.id, e]));
  const proposed = new Set(view.proposals.map((p) => p.expenseId));
  const others = view.unlinked.filter((e) => !proposed.has(e.id));

  function link(targets: Target[]) {
    setError(null);
    startTransition(async () => {
      const res = await linkExpensesAction(targets);
      if (!res.ok) setError(res.error);
    });
  }
  function unlink(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await unlinkExpensesAction([id]);
      if (!res.ok) setError(res.error);
    });
  }

  if (
    view.occurrences.length === 0 ||
    (view.unlinked.length === 0 && view.linked.length === 0)
  )
    return (
      <p className="text-sm text-muted-foreground">
        Aucune dépense à rapprocher ce mois-ci.
      </p>
    );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Les propositions ne sont jamais appliquées d’elles-mêmes : confirme
        chaque liaison. Plusieurs dépenses peuvent régler la même échéance ;
        leur somme décide du statut.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {view.proposals.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              Propositions ({view.proposals.length})
            </h3>
            {!readOnly && view.proposals.length > 1 && (
              <Button
                size="sm"
                variant="bordered"
                className="h-11 sm:h-9"
                isDisabled={pending}
                onPress={() =>
                  link(
                    view.proposals.map((p) => ({
                      expenseId: p.expenseId,
                      costId: p.costId,
                      dueDate: p.occurrenceDueDate,
                    }))
                  )
                }
              >
                <Link2 className="h-4 w-4" aria-hidden />
                Tout confirmer
              </Button>
            )}
          </div>
          <ul className="divide-y rounded-lg border">
            {view.proposals.map((p) => {
              const e = expenseById.get(p.expenseId)!;
              const o = occByKey.get(`${p.costId}|${p.occurrenceDueDate}`)!;
              return (
                <li
                  key={p.expenseId}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="break-words font-medium">
                      {formatDay(e.date)} · {money(e.amount)}
                      {e.note ? ` · ${e.note}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      → {o.label}, échéance du {formatDay(o.dueDate)} (
                      {money(o.amount)}) · {signed(p.delta)}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      size="sm"
                      color="primary"
                      className="h-11 shrink-0 sm:h-9"
                      isDisabled={pending}
                      onPress={() =>
                        link([
                          {
                            expenseId: p.expenseId,
                            costId: p.costId,
                            dueDate: p.occurrenceDueDate,
                          },
                        ])
                      }
                    >
                      Confirmer
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            Autres dépenses non liées ({others.length})
          </h3>
          <ul className="divide-y rounded-lg border">
            {others.map((e) => {
              const choices = view.occurrences.filter(
                (o) => o.categoryId === e.categoryId
              );
              const picked = manual[e.id] ?? '';
              return (
                <li key={e.id} className="space-y-2 p-3">
                  <p className="break-words text-sm font-medium">
                    {formatDay(e.date)} · {money(e.amount)}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                  {!readOnly && choices.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label="Échéance à régler"
                        className={selectClass}
                        value={picked}
                        onChange={(ev) =>
                          setManual((m) => ({ ...m, [e.id]: ev.target.value }))
                        }
                      >
                        <option value="">Choisir une échéance…</option>
                        {choices.map((o) => (
                          <option
                            key={`${o.costId}|${o.dueDate}`}
                            value={`${o.costId}|${o.dueDate}`}
                          >
                            {o.label} · {formatDay(o.dueDate)} ·{' '}
                            {money(o.amount)}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="bordered"
                        className="h-11 shrink-0 sm:h-9"
                        isDisabled={pending || !picked}
                        onPress={() => {
                          const [costId, dueDate] = picked.split('|');
                          link([{ expenseId: e.id, costId, dueDate }]);
                        }}
                      >
                        Lier
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view.linked.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            Dépenses liées ({view.linked.length})
          </h3>
          <ul className="divide-y rounded-lg border">
            {view.linked.map((l) => {
              const o = occByKey.get(`${l.costId}|${l.dueDate}`);
              return (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 p-3"
                >
                  <p className="min-w-0 break-words text-sm">
                    {formatDay(l.date)} · {money(l.amount)} →{' '}
                    {o ? o.label : 'charge'} du {formatDay(l.dueDate)}
                  </p>
                  {!readOnly && (
                    <Button
                      isIconOnly
                      variant="light"
                      className="h-11 w-11 shrink-0"
                      aria-label="Délier"
                      isDisabled={pending}
                      onPress={() => unlink(l.id)}
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
