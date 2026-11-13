'use client';

// Drawer de règlement d'une échéance : le formulaire de dépense habituel,
// prérempli (catégorie, libellé, reste à payer, liaison charge + échéance),
// sans quitter l'onglet Paiements.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Occurrence } from '@/lib/fixed-costs/schedule';
import { formatDay } from '@/lib/fixed-costs/format';
import { todayDateString } from '@/lib/timezone';
import { ExpenseForm } from '../../expense-form';
import type {
  ArticleOption,
  Category,
  ExpenseFormValues,
} from '../expense-form/types';

type PayContext = { openPay: (o: Occurrence) => void } | null;
const Ctx = createContext<PayContext>(null);

/** `null` hors du provider (ex. lecture seule) : le bouton se masque. */
export const usePayOccurrence = () => useContext(Ctx);

export function initialFromOccurrence(o: Occurrence): ExpenseFormValues {
  return {
    date: todayDateString(),
    // Reste à payer, jamais le montant total d'une échéance partielle.
    amount: o.remaining > 0 ? String(o.remaining) : '',
    categoryId: o.categoryId,
    paymentMethod: 'CASH',
    supplier: '',
    note: o.label,
    receiptUrl: null,
    items: [],
    fixedCostId: o.costId,
    dueDate: o.dueDate,
  };
}

export function PayDrawerProvider({
  categories,
  articles,
  children,
}: {
  categories: Category[];
  articles: ArticleOption[];
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Occurrence | null>(null);
  const openPay = useCallback((o: Occurrence) => setTarget(o), []);
  const value = useMemo(() => ({ openPay }), [openPay]);
  const close = () => setTarget(null);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={target !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          {target && (
            <>
              <SheetHeader>
                <SheetTitle>Enregistrer le paiement</SheetTitle>
                <SheetDescription>
                  « {target.label} », échéance du {formatDay(target.dueDate)}.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <ExpenseForm
                  // Une instance neuve par échéance (état + clé d'idempotence).
                  key={`${target.costId}-${target.dueDate}`}
                  categories={categories}
                  articles={articles}
                  mode="create"
                  initial={initialFromOccurrence(target)}
                  embedded
                  submitLabel="Enregistrer le paiement"
                  onSuccess={close}
                  onCancel={close}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
