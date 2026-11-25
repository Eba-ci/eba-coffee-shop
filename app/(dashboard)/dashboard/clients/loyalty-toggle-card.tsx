'use client';

// Contrôle « Fidélité » d'un client sur sa fiche : désactive la carte à tampons
// pour lui seul. Désactivée = GELÉE : plus de tampon gagné, plus de récompense
// proposée ni utilisable ; ce qu'il a déjà (tampons, récompenses) est conservé et
// revient tel quel à la réactivation. L'action serveur exige MANAGER_PLUS.

import { useState } from 'react';
import { Gift } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useServerAction } from '@/lib/hooks/use-server-action';
import { setCustomerLoyaltyDisabledAction } from './loyalty-actions';

type Props = {
  customerId: string;
  loyaltyDisabled: boolean;
  /** Programme coupé pour tout le monde (Paramètres) : le réglage client n'a alors aucun effet. */
  programEnabled: boolean;
};

export function LoyaltyToggleCard({
  customerId,
  loyaltyDisabled,
  programEnabled,
}: Props) {
  const [active, setActive] = useState(!loyaltyDisabled);
  const { run, pending, error, setError } = useServerAction();

  function toggle(next: boolean) {
    const previous = active;
    setActive(next);
    setError(null);
    // Enregistré aussitôt (un seul interrupteur, rien à saisir) ; en cas d'échec
    // on remet l'état précédent pour ne pas afficher ce qui n'est pas enregistré.
    run(async () => {
      const result = await setCustomerLoyaltyDisabledAction(customerId, !next);
      if (!result.ok) setActive(previous);
      return result;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4" aria-hidden="true" />
          Fidélité
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="customer-loyalty" className="cursor-pointer">
              Carte de fidélité active pour ce client
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Désactivée, il ne gagne plus de tampon et ses récompenses ne sont
              plus proposées ni utilisables. Rien n&apos;est effacé : tampons et
              récompenses sont conservés et reviennent à la réactivation.
            </p>
            {!programEnabled && (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                Le programme est désactivé pour toute l&apos;application
                (Paramètres) : ce réglage n&apos;aura d&apos;effet qu&apos;à sa
                réactivation.
              </p>
            )}
          </div>
          <Switch
            id="customer-loyalty"
            checked={active}
            onCheckedChange={toggle}
            disabled={pending}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
