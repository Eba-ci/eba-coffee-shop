'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WeekdayToggle } from './weekday-toggle';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import { createProductScheduleAction } from '../actions';

export function ScheduleForm() {
  const { pushToast } = useUndoToast();
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const created = name.trim();
      const result = await createProductScheduleAction({ name: created, days });
      if (!result.ok) {
        setError(result.error);
        pushToast(result.error, 'error');
        return;
      }
      setName('');
      setDays([]);
      pushToast(`Planning « ${created} » créé`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Input
            placeholder="Nom du planning (ex. Jour du chocolat)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button
          type="submit"
          disabled={isPending || !name.trim() || days.length === 0}
        >
          {isPending ? 'Ajout…' : 'Créer le planning'}
        </Button>
      </div>
      <WeekdayToggle days={days} onChange={setDays} disabled={isPending} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
