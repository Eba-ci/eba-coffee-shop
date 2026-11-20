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
import {
  TiktokVideoFormFields,
  type TiktokVideoFormValues,
} from './tiktok-form-fields';
import { updateTiktokVideoAction } from './actions';

type TiktokVideoScalar = {
  id: string;
  url: string;
  caption: string | null;
  isActive: boolean;
  oembedTitle: string | null;
  authorName: string | null;
};

function toFormValues(video: TiktokVideoScalar): TiktokVideoFormValues {
  return {
    url: video.url,
    caption: video.caption ?? '',
    isActive: video.isActive,
  };
}

/** Bouton + panneau d'édition d'une vidéo TikTok existante. */
export function EditTiktokSheet({ video }: { video: TiktokVideoScalar }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, setError } = useServerAction();
  const [values, setValues] = useState<TiktokVideoFormValues>(() =>
    toFormValues(video)
  );

  function openSheet() {
    setError(null);
    setValues(toFormValues(video));
    setOpen(true);
  }

  function submit() {
    setError(null);
    const url = values.url.trim();
    if (!url) {
      setError('L’URL de la vidéo est obligatoire.');
      return;
    }
    const input = {
      url,
      caption: values.caption.trim() || null,
      isActive: values.isActive,
    };
    run(
      () => updateTiktokVideoAction(video.id, input),
      () => {
        setOpen(false);
      }
    );
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={openSheet}
        aria-label="Modifier la vidéo"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Modifier la vidéo TikTok</SheetTitle>
            <SheetDescription>
              Change l’URL, la légende ou le statut actif/inactif de la vidéo.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <TiktokVideoFormFields
              values={values}
              onChange={setValues}
              idPrefix="tiktok-edit"
            />
            {(video.oembedTitle || video.authorName) && (
              <p className="text-xs text-muted-foreground">
                Détecté automatiquement sur TikTok
                {video.oembedTitle && ` : « ${video.oembedTitle} »`}
                {video.authorName && ` — @${video.authorName}`}
              </p>
            )}
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
