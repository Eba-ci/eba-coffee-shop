// Onglet « Salaires » de Dépenses — RÉSERVÉ À L'ADMIN. La page Dépenses est
// ouverte à MANAGER/COMPTABLE depuis #420 : le garde est donc posé ici, onglet
// par onglet, et non sur la page entière. La section recharge elle-même son
// garde (`requireAdmin`) ; la page ne rend le nœud que pour un admin, si bien
// qu'un non-admin n'obtient ni la section, ni les données.

import { requireAdmin } from '@/lib/auth-helpers';
import {
  getSalaryMonthView,
  listSalaryAdvances,
  listSalaryEmployees,
} from '@/lib/salaries/admin-queries';
import { todayDateString } from '@/lib/timezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalairesMonthNav } from './month-nav';
import { SalaryMonthView } from './month-view';
import { SalaryPaymentDrawer } from './payment-drawer';
import { EmployeeManager } from './employee-manager';
import { AdvanceManager } from './advance-manager';

export async function SalairesSection({ month }: { month: string }) {
  await requireAdmin();
  const currentMonth = todayDateString().slice(0, 7);
  const [view, employees, advances] = await Promise.all([
    getSalaryMonthView(month),
    listSalaryEmployees(currentMonth),
    listSalaryAdvances(),
  ]);
  const options = employees.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="space-y-4">
      <SalairesMonthNav month={month} currentMonth={currentMonth} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vue du mois</CardTitle>
        </CardHeader>
        <CardContent>
          <SalaryMonthView view={view} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nouveau versement</CardTitle>
        </CardHeader>
        <CardContent>
          <SalaryPaymentDrawer
            employees={options}
            defaultMonth={month}
            today={todayDateString()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employés</CardTitle>
        </CardHeader>
        <CardContent>
          <EmployeeManager employees={employees} today={todayDateString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avances</CardTitle>
        </CardHeader>
        <CardContent>
          <AdvanceManager advances={advances} />
        </CardContent>
      </Card>
    </div>
  );
}
