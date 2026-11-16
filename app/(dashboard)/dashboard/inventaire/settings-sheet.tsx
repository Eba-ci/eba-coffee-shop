'use client';

// Réglages du rappel d'inventaire.
//
// `updateInventorySettingsAction` existait sans aucun appelant : `reminderDays`
// n'était modifiable que par MCP ou en base. Ça n'avait guère d'importance tant
// que la bannière du tableau de bord ignorait ce réglage et comparait à 7 en
// dur ; maintenant qu'elle le respecte, il faut pouvoir le régler.

import { useServerAction } from '@/lib/hooks/use-server-action';
import { useState } from 'react';
import { Loader2, Settings2 } from 'lucide-react';

import type { InventorySettings } from '@/lib/inventory-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { updateInventorySettingsAction } from './actions';

export function SettingsSheet({ settings }: { settings: InventorySettings }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, setError } = useServerAction();
  const [enabled, setEnabled] = useState(settings.reminderEnabled);
  const [days, setDays] = useState(String(settings.reminderDays));

  function submit() {
    setError(null);
    const parsed = Number(days.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      setError('Le délai doit être un nombre de jours entre 1 et 365.');
      return;
    }
    run(
      () =>
        updateInventorySettingsAction({
          reminderEnabled: enabled,
          reminderDays: parsed,
        }),
      () => {
        setOpen(false);
      }
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1.5 h-4 w-4" />
          Réglages
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Réglages de l&apos;inventaire</SheetTitle>
          <SheetDescription>
            Rappel automatique quand le stock n&apos;a pas été compté depuis un
            certain temps.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="flex items-center gap-2">
            <Switch
              id="inv-reminder-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="inv-reminder-enabled" className="cursor-pointer">
              Envoyer un rappel par email
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-reminder-days">
              Alerter après (jours sans comptage)
            </Label>
            <Input
              id="inv-reminder-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              className="h-11 w-32 tabular-nums"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ce délai pilote aussi la bannière rouge en haut de l&apos;écran.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
