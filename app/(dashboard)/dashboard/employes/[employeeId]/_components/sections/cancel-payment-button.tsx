'use client';

// Annulation d'un versement : jamais supprimé, motif obligatoire. Le geste se
// déplie en place (motif + confirmation) plutôt que d'ouvrir une modale.

import { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServerAction } from '@/lib/hooks/use-server-action';
import { cancelSalaryPaymentAction } from '../../../salary-actions';

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending, error, clearError } = useServerAction();

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-11 px-2 text-muted-foreground sm:h-8"
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        <Ban className="size-4" aria-hidden="true" />
        Annuler
      </Button>
    );
  }

  function submit() {
    // L'action revalide /dashboard/employes : aucun second rendu côté client.
    run(
      () => cancelSalaryPaymentAction({ paymentId, reason }),
      () => {
        setOpen(false);
        setReason('');
      }
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border bg-muted/30 p-3">
      <Input
        aria-label="Motif de l’annulation"
        className="h-11"
        placeholder="Motif (obligatoire)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          clearError();
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={() => {
            clearError();
            setOpen(false);
          }}
          disabled={pending}
        >
          Garder
        </Button>
        <Button
          variant="destructive"
          className="h-11 flex-1"
          onClick={submit}
          disabled={pending || reason.trim().length < 3}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Annuler le versement
        </Button>
      </div>
    </div>
  );
}
