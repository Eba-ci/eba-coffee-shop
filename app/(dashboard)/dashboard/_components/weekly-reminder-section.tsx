import { getPaymentsView } from '@/lib/fixed-costs/queries';
import {
  buildWeeklyReminder,
  monthOf,
} from '@/lib/fixed-costs/weekly-reminder';
import { listExpenseCategories } from '@/lib/expenses';
import { todayDateString } from '@/lib/timezone';
import { loadArticleOptions } from '../depenses/_components/article-options';
import { PayDrawerProvider } from '../depenses/_components/paiements/pay-drawer';
import { WeeklyReminderCard } from './weekly-reminder-card';

/** Rôles qui voient le rappel (ANALYSTE en lecture seule). */
export const REMINDER_ROLES = ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'];

export async function WeeklyReminderSection({ role }: { role: string }) {
  if (!REMINDER_ROLES.includes(role)) return null;
  const readOnly = role === 'ANALYSTE';
  const today = todayDateString();
  // `salaryTotal` de la vue est volontairement ignoré : jamais affiché ici.
  const [{ week }, categories, articles] = await Promise.all([
    getPaymentsView(monthOf(today)),
    readOnly ? Promise.resolve([]) : listExpenseCategories(),
    readOnly ? Promise.resolve([]) : loadArticleOptions(),
  ]);
  const card = (
    <WeeklyReminderCard
      reminder={buildWeeklyReminder(week, today)}
      readOnly={readOnly}
    />
  );
  if (readOnly) return card;
  return (
    <PayDrawerProvider
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      articles={articles}
    >
      {card}
    </PayDrawerProvider>
  );
}
