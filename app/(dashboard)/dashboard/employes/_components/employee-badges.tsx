// Badges de statut sémantiques (#441) : libellé + icône, jamais la couleur
// seule. Soldé = primary (défaut), partiel = secondary, en retard = destructive.

import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { employmentLabel } from '@/lib/employees/format';
import { money } from '@/lib/fixed-costs/format';

export function EmploymentBadge({
  active,
  endDate,
}: {
  active: boolean;
  endDate: string | null;
}) {
  if (active) {
    return (
      <Badge variant="outline">
        <UserCheck aria-hidden="true" />
        En poste
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <LogOut aria-hidden="true" />
      {employmentLabel(active, endDate)}
    </Badge>
  );
}

export function MonthStateBadge({
  remainingToPay,
}: {
  remainingToPay: number;
}) {
  if (remainingToPay > 0) {
    return (
      <Badge variant="secondary">
        <AlertCircle aria-hidden="true" />
        Mois non soldé
      </Badge>
    );
  }
  return (
    <Badge>
      <CheckCircle2 aria-hidden="true" />
      Soldé
    </Badge>
  );
}

export function ArrearsBadge({ total }: { total: number }) {
  if (total <= 0) return null;
  return (
    <Badge variant="destructive">
      <TriangleAlert aria-hidden="true" />
      Arriéré <span className="tabular-nums">{money(total)}</span>
    </Badge>
  );
}
