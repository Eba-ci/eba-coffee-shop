'use client';

import { useServerAction } from '@/lib/hooks/use-server-action';
import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PollFormFields, type PollScalarValues } from './poll-form-fields';
import { updatePollAction } from './actions';

type PollScalar = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  allowSuggestions: boolean;
  resultsVisibility: 'LIVE' | 'AFTER_CLOSE';
};

function toFormValues(poll: PollScalar): PollScalarValues {
  return {
    title: poll.title,
    description: poll.description ?? '',
    imageUrl: poll.imageUrl,
    allowSuggestions: poll.allowSuggestions,
    resultsVisibility: poll.resultsVisibility,
  };
}

/** Bouton + panneau d'édition d'un sondage existant (titre, description,
 * image de couverture, réglages). Autonome — utilisable depuis la liste des
 * sondages (icône crayon) ET depuis la page de détail (bouton "Modifier"). */
export function EditPollSheet({
  poll,
  variant = 'icon',
}: {
  poll: PollScalar;
  variant?: 'icon' | 'button';
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, setError } = useServerAction();
  const [values, setValues] = useState<PollScalarValues>(() =>
    toFormValues(poll)
  );

  function openSheet() {
    setError(null);
    setValues(toFormValues(poll));
    setOpen(true);
  }

  function submit() {
    setError(null);
    const title = values.title.trim();
    if (!title) {
      setError('Le titre est obligatoire.');
      return;
    }
    const input = {
      title,
      description: values.description.trim() || null,
      imageUrl: values.imageUrl,
      allowSuggestions: values.allowSuggestions,
      resultsVisibility: values.resultsVisibility,
    };
    run(
      () => updatePollAction(poll.id, input),
      () => {
        setOpen(false);
      }
    );
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          size="icon"
          variant="ghost"
          onClick={openSheet}
          aria-label="Modifier le sondage"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={openSheet}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Modifier
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Modifier le sondage</SheetTitle>
            <SheetDescription>
              Les options se gèrent séparément, depuis la page de détail du
              sondage.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <PollFormFields
              values={values}
              onChange={setValues}
              idPrefix="poll-edit"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="mt-2" onClick={submit} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
