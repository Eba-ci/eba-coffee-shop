'use client';

// Contrôle « Client de confiance » (ardoise) sur la fiche client.
//
// Surface DÉDIÉE, séparée du formulaire nom/téléphone : accorder la confiance
// autorise les commandes saisies en caisse pour ce client à partir en cuisine
// SANS encaissement préalable (cf. `Order.isOnAccount`). C'est une décision
// financière — l'action serveur exige MANAGER_PLUS.
//
// Le motif (`trustedNote`) est facultatif : raison de l'octroi ou plafond
// d'ardoise convenu avec le client.

import { useState, useTransition } from 'react';
import { Handshake, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CUSTOMER_TRUSTED_NOTE_MAX } from '@/config/constants';
import { setCustomerTrustedAction } from './actions';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

type Props = {
  customerId: string;
  isTrusted: boolean;
  trustedSince: Date | null;
  trustedNote: string | null;
};

export function TrustedCustomerCard({
  customerId,
  isTrusted,
  trustedSince,
  trustedNote,
}: Props) {
  const [trusted, setTrusted] = useState(isTrusted);
  const [note, setNote] = useState(trustedNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // « Sale » = l'état affiché diverge de l'état enregistré : le bouton
  // n'apparaît que là, pour éviter un enregistrement à vide.
  const dirty = trusted !== isTrusted || note !== (trustedNote ?? '');

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setCustomerTrustedAction(
        customerId,
        trusted,
        note.trim() || null
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="h-4 w-4" aria-hidden="true" />
          Client de confiance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="customer-trusted" className="cursor-pointer">
              Autoriser l&apos;ardoise
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Ses commandes saisies en caisse partent en cuisine sans
              encaissement. La commande reste <strong>non payée</strong> : le
              montant dû apparaît dans l&apos;ardoise jusqu&apos;au règlement.
            </p>
            {isTrusted && trustedSince && (
              <p className="mt-1 text-xs text-muted-foreground">
                Confiance accordée le {dateFmt.format(trustedSince)}.
              </p>
            )}
          </div>
          <Switch
            id="customer-trusted"
            checked={trusted}
            onCheckedChange={setTrusted}
            disabled={pending}
          />
        </div>

        {trusted && (
          <div className="grid gap-1.5">
            <Label htmlFor="customer-trusted-note">
              Motif ou plafond convenu
            </Label>
            <Textarea
              id="customer-trusted-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Facultatif — ex. « voisine, règle le samedi », « max 20 000 F »"
              maxLength={CUSTOMER_TRUSTED_NOTE_MAX}
              rows={2}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {dirty && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
