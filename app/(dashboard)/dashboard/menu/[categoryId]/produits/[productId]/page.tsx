import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { listProductSchedules, listProductWeeklySpecials } from '@/lib/menu';
import { ProductForm, type ProductFormInitial } from '../product-form';
import { ProductStatsSection } from '../_components/product-stats-section';
import { ProductStockSection } from '../_components/product-stock-section';
import { requireRoleOrAnalyst, ROLE_GROUPS } from '@/lib/auth-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { BackButton } from '@/components/(dashboard)/back-button';
import { MenuBreadcrumb } from '@/components/(dashboard)/menu-breadcrumb';
import { DateRangeFilter } from '@/components/(dashboard)/date-range-filter';
import { KpiGridSkeleton } from '@/components/(dashboard)/skeletons';
import {
  parseDateOnlyToUTC,
  shiftDateString,
  todayDateString,
} from '@/lib/timezone';

// Données live + le filtre de dates de l'onglet Statistiques lit l'URL
// (`useSearchParams`), ce qui interdit le prérendu statique.
export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string; productId: string }>;
  searchParams: Promise<{ from?: string; to?: string; onglet?: string }>;
}) {
  // Le journal et les commandes ne sont pas pour tout le dashboard (cuisine, compta) :
  // `app/(dashboard)/layout.tsx` ne filtre que sur le rôle « tableau de bord ».
  await requireRoleOrAnalyst(ROLE_GROUPS.MENU);
  const { categoryId, productId } = await params;
  const query = await searchParams;

  const [category, product, schedules, weeklySpecials] = await Promise.all([
    prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, deletedAt: true },
    }),
    prisma.product.findUnique({
      where: { id: productId },
      include: {
        supplementGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    }),
    listProductSchedules(),
    listProductWeeklySpecials(productId),
  ]);

  if (
    !category ||
    category.deletedAt ||
    !product ||
    product.deletedAt ||
    product.categoryId !== categoryId
  ) {
    notFound();
  }

  const today = todayDateString();
  const defaultFrom = shiftDateString(today, -(DEFAULT_RANGE_DAYS - 1));
  let fromStr = parseDateOnlyToUTC(query.from) ? query.from! : defaultFrom;
  let toStr = parseDateOnlyToUTC(query.to) ? query.to! : today;
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    coutMatiere: product.coutMatiere,
    coutEmballage: product.coutEmballage,
    imageUrl: product.imageUrl,
    featured: product.featured,
    featuredOrder: product.featuredOrder,
    featuredBadge: product.featuredBadge,
    stockQuantity: product.stockQuantity,
    unavailableUntil: product.unavailableUntil,
    scheduleId: product.scheduleId,
    advanceOrderDays: product.advanceOrderDays,
    requiresDeposit: product.requiresDeposit,
    preorderable: product.preorderable,
    weeklySpecials,
    supplementGroups: product.supplementGroups.map((g) => ({
      name: g.name,
      kind: g.kind === 'flavor' ? ('flavor' as const) : ('extra' as const),
      type: g.type as 'single' | 'multiple' | 'quantity',
      required: g.required,
      available: g.available,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        name: o.name,
        price: o.price,
        available: o.available,
        stockQuantity: o.stockQuantity,
      })),
    })),
  };

  // Rendu côté serveur et passé en prop au formulaire (client) : les stats
  // restent une lecture serveur, streamée pour ne pas retarder le formulaire.
  const statsSlot = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Du {fromStr} au {toStr}
        </p>
        <DateRangeFilter
          from={fromStr}
          to={toStr}
          isAll={false}
          allowAll={false}
          presets={[
            { label: '7 jours', days: 7 },
            { label: '30 jours', days: 30 },
            { label: '90 jours', days: 90 },
          ]}
        />
      </div>
      <Suspense key={`${fromStr}-${toStr}`} fallback={<KpiGridSkeleton />}>
        <ProductStatsSection
          productId={product.id}
          from={parseDateOnlyToUTC(fromStr)!}
          to={parseDateOnlyToUTC(toStr)!}
        />
      </Suspense>
    </div>
  );

  const stockSlot = (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ProductStockSection
        productId={product.id}
        stockQuantity={product.stockQuantity}
        options={product.supplementGroups.flatMap((g) =>
          g.options.map((o) => ({
            id: o.id,
            groupName: g.name,
            name: o.name,
            stockQuantity: o.stockQuantity,
          }))
        )}
      />
    </Suspense>
  );

  return (
    <div className="space-y-6">
      <div>
        <MenuBreadcrumb
          items={[
            { label: category.name, href: `/dashboard/menu/${categoryId}` },
            { label: product.name },
          ]}
        />
        <BackButton
          fallbackHref={`/dashboard/menu/${categoryId}`}
          label={category.name}
          className="-ml-3 mb-2 mt-2"
        />
        <h1 className="text-2xl font-bold">Modifier {product.name}</h1>
      </div>
      <ProductForm
        categoryId={categoryId}
        initial={initial}
        schedules={schedules}
        defaultTab={query.onglet}
        statsSlot={statsSlot}
        stockSlot={stockSlot}
      />
    </div>
  );
}
