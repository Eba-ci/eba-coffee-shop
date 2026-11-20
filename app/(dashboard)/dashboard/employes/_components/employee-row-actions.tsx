'use client';

// Menu d'actions d'une ligne Employés (#466). La liste ne contient que des
// liens, boutons et résumés : chaque action d'écriture ouvre le tiroir #441
// (ou le tiroir de versement). Une action indisponible est désactivée avec son
// explication ; un COMPTABLE ne reçoit aucune action d'écriture (le serveur la
// refuserait de toute façon).

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CalendarX2,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { EmployeeListRow } from '@/lib/employees/queries';
import { reactivateEmployeeAction } from '../actions';
import { SalaryPaymentDrawer } from './paie/payment-drawer';
import { EmployeeEditDrawer } from './employee-edit-drawer';
import { EmployeeExitDrawer } from './employee-exit-drawer';
import { EmployeeRateDrawer } from './employee-rate-drawer';

export function EmployeeRowActions({
  row,
  today,
  month,
  canWrite,
}: {
  row: EmployeeListRow;
  today: string;
  month: string;
  /** ADMIN uniquement : un COMPTABLE consulte sans action d'écriture. */
  canWrite: boolean;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [reactivateConfirm, setReactivateConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const identity = {
    id: row.id,
    name: row.name,
    position: row.position,
    startDate: row.startDate,
    note: row.note,
  };

  function reactivate() {
    setError(null);
    startTransition(async () => {
      const result = await reactivateEmployeeAction(row.id);
      if (!result.ok) return setError(result.error);
      setReactivateConfirm(false);
    });
  }

  // COMPTABLE : aucune action d'écriture, aucun menu — la ligne reste un lien.
  if (!canWrite) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 shrink-0"
            aria-label={`Actions pour ${row.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
          <DropdownMenuItem asChild className="min-h-11">
            <Link href={`/dashboard/employes/${row.id}`}>
              <Eye className="size-4" aria-hidden="true" />
              Voir la fiche
            </Link>
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => setPayOpen(true)}
                disabled={row.currentRate === null}
              >
                <Wallet className="size-4" aria-hidden="true" />
                Payer un salaire
                {row.currentRate === null && (
                  <span className="text-xs text-muted-foreground">
                    (aucun taux)
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => setEditOpen(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Modifier la fiche
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => setRateOpen(true)}
                disabled={!row.active}
              >
                <Plus className="size-4" aria-hidden="true" />
                Ajouter un taux
                {!row.active && (
                  <span className="text-xs text-muted-foreground">
                    (employé sorti)
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.active ? (
                <DropdownMenuItem
                  variant="destructive"
                  className="min-h-11"
                  onSelect={() => setExitConfirm(true)}
                >
                  <CalendarX2 className="size-4" aria-hidden="true" />
                  Enregistrer une sortie
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => setReactivateConfirm(true)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Réactiver
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {canWrite && (
        <SalaryPaymentDrawer
          employees={[{ id: row.id, name: row.name }]}
          defaultMonth={month}
          today={today}
          defaultEmployeeId={row.id}
          situations={{
            [row.id]: {
              remaining: row.month.remainingToPay,
              arrears: row.arrearsTotal,
            },
          }}
          open={payOpen}
          onOpenChange={setPayOpen}
          hideTrigger
        />
      )}

      {canWrite && (
        <>
          <EmployeeEditDrawer
            employee={identity}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <EmployeeRateDrawer
            employee={{ ...identity, rates: row.rates }}
            open={rateOpen}
            onOpenChange={setRateOpen}
            today={today}
          />
          <EmployeeExitDrawer
            employee={identity}
            open={exitOpen}
            onOpenChange={setExitOpen}
            today={today}
          />

          <AlertDialog open={exitConfirm} onOpenChange={setExitConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Enregistrer la sortie de {row.name} ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {row.name} deviendra inactif et n’apparaîtra plus parmi les
                  employés en poste. Son historique (taux, versements, arriéré)
                  est conservé, et une réactivation reste possible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11"
                  onClick={() => setExitOpen(true)}
                >
                  Enregistrer une sortie
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={reactivateConfirm}
            onOpenChange={setReactivateConfirm}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Réactiver {row.name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  {row.name} repassera parmi les employés en poste et sa date de
                  sortie sera effacée. L’historique de paie reste intact.
                  {row.currentRate === null && (
                    <span className="mt-2 block font-medium text-foreground">
                      Aucun taux n’est défini : ajoute un taux après la
                      réactivation.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11"
                  onClick={reactivate}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  Réactiver
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
