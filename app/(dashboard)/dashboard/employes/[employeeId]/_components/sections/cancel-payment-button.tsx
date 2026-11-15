'use client';

// Annulation d'un versement : jamais supprimé, motif obligatoire. Le geste se
// déplie en place (motif + confirmation) plutôt que d'ouvrir une modale.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cancelSalaryPaymentAction } from '../../../salary-actions';

export function CancelPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-11 px-2 text-muted-foreground sm:h-8"
        onClick={() => setOpen(true)}
      >
        <Ban className="size-4" aria-hidden="true" />
        Annuler
      </Button>
    );
  }

  function submit() {
    startTransition(async () => {
      const r = await cancelSalaryPaymentAction({ paymentId, reason });
      if (r.ok) router.refresh();
      else setError(r.error);
    });
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
          setError(null);
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={() => setOpen(false)}
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
