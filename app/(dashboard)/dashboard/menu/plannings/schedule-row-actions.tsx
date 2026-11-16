'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WeekdayToggle } from './weekday-toggle';
import { ConfirmDialog } from '@/components/(dashboard)/confirm-dialog';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import {
  updateProductScheduleAction,
  deleteProductScheduleAction,
} from '../actions';

export function ScheduleRowActions({
  id,
  name,
  days,
  inUse,
}: {
  id: string;
  name: string;
  days: number[];
  inUse: boolean;
}) {
  const { pushToast } = useUndoToast();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editDays, setEditDays] = useState<number[]>(days);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setEditName(name);
    setEditDays(days);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function confirmEdit() {
    if (!editName.trim() || editDays.length === 0) return;
    startTransition(async () => {
      const result = await updateProductScheduleAction(id, {
        name: editName.trim(),
        days: editDays,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      pushToast('Planning enregistré');
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProductScheduleAction(id);
      setConfirmDelete(false);
      if (!result.ok) {
        pushToast(result.error, 'error');
        return;
      }
      pushToast(`Planning « ${name} » supprimé`);
    });
  }

  if (isEditing) {
    return (
      <div className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-center gap-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-8 max-w-56 text-sm"
            autoFocus
            disabled={isPending}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={confirmEdit}
            disabled={isPending || !editName.trim() || editDays.length === 0}
            aria-label="Confirmer"
          >
            <Check className="size-4 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={cancelEdit}
            disabled={isPending}
            aria-label="Annuler"
          >
            <X className="size-4" />
          </Button>
        </div>
        <WeekdayToggle
          days={editDays}
          onChange={setEditDays}
          disabled={isPending}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isPending}
        onClick={startEdit}
        aria-label="Modifier"
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isPending}
        onClick={() => setConfirmDelete(true)}
        aria-label="Supprimer"
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer « ${name} » ?`}
        description={
          inUse
            ? 'Les produits et catégories qui l’utilisent redeviendront disponibles tous les jours.'
            : 'Ce planning n’est utilisé par aucun produit ni aucune catégorie.'
        }
        confirmLabel="Supprimer"
        destructive
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
