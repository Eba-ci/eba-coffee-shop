'use client';

// Formulaire de création / modification d'un client (CRM), présenté dans un
// Sheet. Le bouton déclencheur est intégré (Plus = nouveau, Pencil = modifier).
// La création redirige vers la fiche du nouveau client ; la modification
// rafraîchit la page courante.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ORDER_CUSTOMER_NAME_MAX,
  ORDER_CUSTOMER_PHONE_MAX,
} from '@/config/constants';
import { createCustomerAction, updateCustomerAction } from './actions';

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      id: string;
      name: string | null;
      phone: string;
      dateOfBirth: string | null;
    };

export function CustomerFormSheet(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === 'edit';

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(
    props.mode === 'edit' ? (props.name ?? '') : ''
  );
  const [phone, setPhone] = useState(props.mode === 'edit' ? props.phone : '');
  const [dateOfBirth, setDateOfBirth] = useState(
    props.mode === 'edit' ? (props.dateOfBirth ?? '') : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openSheet() {
    // Réinitialise depuis les props à chaque ouverture (utile en édition).
    if (props.mode === 'edit') {
      setName(props.name ?? '');
      setPhone(props.phone);
      setDateOfBirth(props.dateOfBirth ?? '');
    } else {
      setName('');
      setPhone('');
      setDateOfBirth('');
    }
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res =
        props.mode === 'edit'
          ? await updateCustomerAction(props.id, {
              name,
              phone,
              dateOfBirth: dateOfBirth || null,
            })
          : await createCustomerAction({
              name,
              phone,
              dateOfBirth: dateOfBirth || null,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (props.mode === 'create') {
        router.push(`/dashboard/clients/${res.id}`);
      } else {
      }
    });
  }

  return (
    <>
      {!isEdit ? (
        <Button size="sm" onClick={openSheet}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nouveau client
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={openSheet}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Modifier
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? 'Modifier le client' : 'Nouveau client'}
            </SheetTitle>
            <SheetDescription>
              Le client est identifié par son numéro de téléphone.
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
              <Label htmlFor="customer-form-phone">Téléphone</Label>
              <Input
                id="customer-form-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07 88 12 34 56"
                maxLength={ORDER_CUSTOMER_PHONE_MAX}
                autoComplete="off"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="customer-form-name">Nom</Label>
              <Input
                id="customer-form-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Facultatif"
                maxLength={ORDER_CUSTOMER_NAME_MAX}
                autoComplete="off"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="customer-form-dob">Date de naissance</Label>
              <Input
                id="customer-form-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={pending || phone.trim() === ''}>
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isEdit ? 'Enregistrer' : 'Créer le client'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
