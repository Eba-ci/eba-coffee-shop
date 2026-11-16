'use client';

// Rattrapage de tampons de fidélité pour des commandes non enregistrées
// (paiement cash oublié en caisse, etc.). Ouvre un Sheet depuis la fiche
// client, débloque les récompenses de palier si l'ajustement les franchit.

import { useState, useTransition } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  MISSED_ORDER_STAMPS_MAX,
  MISSED_ORDER_STAMPS_NOTE_MAX,
} from '@/config/constants';
import { addMissedOrderStampsAction } from './actions';

export function MissedOrderStampsSheet({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openSheet() {
    setCount('1');
    setNote('');
    setError(null);
    setSuccess(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    setSuccess(null);
    const parsed = Number(count);
    startTransition(async () => {
      const res = await addMissedOrderStampsAction(
        customerId,
        parsed,
        note.trim() || undefined
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        res.rewardsCreated > 0
          ? `Tampons ajoutés — ${res.rewardsCreated} récompense(s) débloquée(s). Solde : ${res.stampCount}.`
          : `Tampons ajoutés. Solde : ${res.stampCount}.`
      );
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openSheet}>
        <PlusCircle className="mr-1.5 h-4 w-4" />
        Commande manquée
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Rattraper une commande manquée</SheetTitle>
            <SheetDescription>
              Ajoute des tampons pour une ou plusieurs commandes passées en
              boutique mais jamais enregistrées (paiement cash, oubli de
              saisie...).
            </SheetDescription>
          </SheetHeader>

          <form
            className="grid gap-4 px-4 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="missed-orders-count">
                Nombre de commandes manquées
              </Label>
              <Input
                id="missed-orders-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={MISSED_ORDER_STAMPS_MAX}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="missed-orders-note">Note (facultatif)</Label>
              <Textarea
                id="missed-orders-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex : commande cash du 05/07 non enregistrée"
                maxLength={MISSED_ORDER_STAMPS_NOTE_MAX}
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Fermer
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Ajouter
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
