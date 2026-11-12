import { Suspense } from 'react';
import { expirePendingOrders } from '@/lib/jeko/expiry';
import { refreshPendingRefunds } from '@/lib/refunds/refresh';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BarChart3, ChefHat, ShoppingBag } from 'lucide-react';
import { requireDashboardAccess } from '@/lib/auth-helpers';
import { getPickupSettings } from '@/lib/pickup-settings-db';
import { isClosedByOverride } from '@/lib/pickup-today-toggle';
import { todayDateString } from '@/lib/timezone';
import { maybeSendInventoryReminder } from '@/lib/inventory-mutations';
import { Button } from '@/components/ui/button';
import {
  KpiGridSkeleton,
  ChartCardSkeleton,
} from '@/components/(dashboard)/skeletons';
import { TodayKpisSection } from './_components/today-kpis-section';
import { TrendSection } from './_components/trend-section';
import { LowStockSection } from './_components/low-stock-section';
import { ShopToggleButton } from './_components/shop-toggle-button';
import { WeeklyReminderSection } from './_components/weekly-reminder-section';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireDashboardAccess();
  const role = session.user.role;

  if (role === 'CASHIER') redirect('/dashboard/caisse');
  if (role === 'KITCHEN') redirect('/dashboard/preparation');

  // Rappel d'inventaire (idempotent, fire-and-forget, ne lève jamais).
  void maybeSendInventoryReminder().catch(() => {});

  // Expiration opportuniste des commandes en attente de paiement Jèko (pas de
  // cron : même principe que le rappel d'inventaire — idempotent, fire-and-forget).
  void expirePendingOrders().catch(() => {});
  void refreshPendingRefunds().catch(() => {});

  const shopClosed =
    role === 'ADMIN'
      ? isClosedByOverride(await getPickupSettings(), todayDateString())
      : null;

  const todayLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>
          <p className="text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shopClosed !== null && (
            <ShopToggleButton initialClosed={shopClosed} />
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/statistiques">
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Statistiques
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/caisse">
              <ShoppingBag className="mr-1.5 h-4 w-4" />
              Caisse
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/preparation">
              <ChefHat className="mr-1.5 h-4 w-4" />
              Préparation
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={null}>
        <WeeklyReminderSection role={role} />
      </Suspense>

      <Suspense
        fallback={
          <div className="space-y-6">
            <KpiGridSkeleton count={4} cols={4} />
            <ChartCardSkeleton height={200} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ChartCardSkeleton height={180} />
              <ChartCardSkeleton height={180} />
            </div>
            <ChartCardSkeleton height={120} />
          </div>
        }
      >
        <TodayKpisSection />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton height={300} />}>
        <TrendSection />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton height={200} />}>
        <LowStockSection />
      </Suspense>
    </div>
  );
}
