'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  SupplementsEditor,
  type SupplementGroup,
} from '@/components/(dashboard)/supplements-editor';
import {
  pruneSupplementGroups,
  validateSupplementGroups,
} from '@/lib/supplements-form';
import { useUndoToast } from '@/lib/hooks/use-undo-toast';
import { saveGlobalExtrasAction } from '../actions';

type Props = {
  initialGroups: SupplementGroup[];
};

export function GlobalExtrasForm({ initialGroups }: Props) {
  const { pushToast } = useUndoToast();
  const [groups, setGroups] = useState<SupplementGroup[]>(initialGroups);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Même validation que la fiche produit : les deux écrans partagent l'éditeur,
  // ils doivent aussi partager le moment et la formulation du refus.
  const issues = useMemo(() => validateSupplementGroups(groups), [groups]);
  const [showErrors, setShowErrors] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (issues.size > 0) {
      setShowErrors(true);
      pushToast(
        'Corrigez les suppléments signalés avant d’enregistrer.',
        'error'
      );
      return;
    }

    startTransition(async () => {
      const payload = pruneSupplementGroups(groups);
      const result = await saveGlobalExtrasAction(payload);
      if (!result.ok) {
        setError(result.error);
        pushToast(result.error, 'error');
        return;
      }
      pushToast('Extras globaux enregistrés');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SupplementsEditor
        groups={groups}
        onChange={setGroups}
        issues={showErrors ? issues : undefined}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  );
}
