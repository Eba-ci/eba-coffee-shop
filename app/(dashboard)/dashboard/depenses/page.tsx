import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireRoleOrAnalyst } from '@/lib/auth-helpers';
import {
  parseDateOnlyToUTC,
  todayDateString,
  shiftDateString,
} from '@/lib/timezone';
import { getExpenseSettings } from '@/lib/expense-settings-db';
import { DateRangeFilter } from '@/components/(dashboard)/date-range-filter';
import {
  KpiGridSkeleton,
  ChartCardSkeleton,
  TableSkeleton,
} from '@/components/(dashboard)/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DepensesTabs } from './depenses-tabs';
import { ExpenseSettingsButton } from './expense-settings-sheet';
import { ReceiptBackfillAlertSection } from './_components/receipt-backfill-alert-section';
import { RecurringAlertSection } from './_components/recurring-alert-section';
import { ApercuSection } from './_components/apercu-section';
import { HistoriqueSection } from './_components/historique-section';
import { ArticlesSection } from './_components/articles-section';
import { RecurrentesSection } from './_components/recurrentes-section';
import { PointMortSection } from './_components/point-mort-section';
import { PaymentsSection } from './_components/paiements/payments-section';
import { SalairesGlobalLine } from './_components/salaires-global-line';
import { HideOnTab } from './_components/hide-on-tab';
import { loadPointMortParams } from './point-mort-search-params';
import { parseMonth } from '@/lib/fixed-costs/month';
import { ArticleHistorySection } from './_components/article-history-section';

export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

const PAYMENT_METHODS = ['CASH', 'WAVE', 'BANK', 'OTHER'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export default async function DepensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
    category?: string;
    payment?: string;
    search?: string;
    tab?: string;
    article?: string;
    mois?: string;
  }>;
}) {
  const session = await requireRoleOrAnalyst(['ADMIN', 'MANAGER', 'COMPTABLE']);
  // ANALYSTE = lecture seule : l'onglet Paiements lui masque l'action d'écriture.
  const readOnly = session.user.role === 'ANALYSTE';
  const params = await searchParams;
  const pointMortMonth = parseMonth(
    loadPointMortParams(params).mois,
    todayDateString()
  );

  const isAll = params.range === 'all';
  const today = todayDateString();
  const defaultFrom = shiftDateString(today, -(DEFAULT_RANGE_DAYS - 1));
  let fromStr = '';
  let toStr = '';
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (!isAll) {
    fromStr = parseDateOnlyToUTC(params.from) ? params.from! : defaultFrom;
    toStr = parseDateOnlyToUTC(params.to) ? params.to! : today;
    if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
    dateFrom = parseDateOnlyToUTC(fromStr);
    dateTo = parseDateOnlyToUTC(toStr);
  }

  const categoryId = params.category || undefined;
  const paymentMethod = PAYMENT_METHODS.includes(
    params.payment as PaymentMethod
  )
    ? (params.payment as PaymentMethod)
    : undefined;
  const search = params.search?.trim() || undefined;

  const exportSp = new URLSearchParams();
  if (isAll) exportSp.set('range', 'all');
  else {
    exportSp.set('from', fromStr);
    exportSp.set('to', toStr);
  }
  if (categoryId) exportSp.set('category', categoryId);
  if (paymentMethod) exportSp.set('payment', paymentMethod);
  if (search) exportSp.set('search', search);
  const exportHref = `/api/export/expenses?${exportSp.toString()}`;

  const exportItemsSp = new URLSearchParams();
  if (isAll) exportItemsSp.set('range', 'all');
  else {
    exportItemsSp.set('from', fromStr);
    exportItemsSp.set('to', toStr);
  }
  const exportItemsHref = `/api/export/expense-items?${exportItemsSp.toString()}`;

  const periodLabel = isAll ? 'Tout l’historique' : `Du ${fromStr} au ${toStr}`;
  const expenseSettings = await getExpenseSettings();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dépenses</h1>
          <HideOnTab tab={['pointmort', 'paiements']}>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </HideOnTab>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExpenseSettingsButton settings={expenseSettings} />
          <HideOnTab tab={['pointmort', 'paiements']}>
            <DateRangeFilter from={fromStr} to={toStr} isAll={isAll} />
          </HideOnTab>
          {/* Accessible quel que soit l'onglet actif, plus seulement depuis
              la table de l'Historique. */}
          <Button asChild size="sm">
            <Link href="/dashboard/depenses/nouvelle">
              <Plus className="mr-1.5 h-4 w-4" />
              Nouvelle dépense
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={null}>
        <SalairesGlobalLine month={pointMortMonth} />
      </Suspense>

      <Suspense fallback={null}>
        <ReceiptBackfillAlertSection />
      </Suspense>

      <Suspense fallback={null}>
        <RecurringAlertSection />
      </Suspense>

      <DepensesTabs
        defaultTab={params.tab}
        apercu={
          <Suspense
            fallback={
              <div className="space-y-4">
                <KpiGridSkeleton count={4} cols={4} />
                <ChartCardSkeleton height={280} />
                <ChartCardSkeleton height={280} />
              </div>
            }
          >
            <ApercuSection
              dateFrom={dateFrom}
              dateTo={dateTo}
              categoryId={categoryId}
              paymentMethod={paymentMethod}
              search={search}
            />
          </Suspense>
        }
        historique={
          <Suspense fallback={<TableSkeleton rows={10} />}>
            <HistoriqueSection
              dateFrom={dateFrom}
              dateTo={dateTo}
              categoryId={categoryId}
              paymentMethod={paymentMethod}
              search={search}
              periodLabel={periodLabel}
              exportHref={exportHref}
            />
          </Suspense>
        }
        articles={
          <Suspense fallback={<TableSkeleton rows={10} />}>
            <ArticlesSection
              dateFrom={dateFrom}
              dateTo={dateTo}
              categoryId={categoryId}
              paymentMethod={paymentMethod}
              search={search}
              periodLabel={periodLabel}
              exportItemsHref={exportItemsHref}
            />
          </Suspense>
        }
        recurrentes={
          <Suspense fallback={<TableSkeleton rows={6} withToolbar={false} />}>
            <RecurrentesSection />
          </Suspense>
        }
        pointmort={
          <Suspense fallback={<TableSkeleton rows={8} withToolbar={false} />}>
            <PointMortSection month={pointMortMonth} />
          </Suspense>
        }
        paiements={
          <Suspense fallback={<TableSkeleton rows={8} withToolbar={false} />}>
            <PaymentsSection month={pointMortMonth} readOnly={readOnly} />
          </Suspense>
        }
      />

      {params.article && (
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ArticleHistorySection
            articleId={params.article}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </Suspense>
      )}
    </div>
  );
}
