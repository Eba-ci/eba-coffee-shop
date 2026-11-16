'use client';

import { useState, useTransition } from 'react';
import { MediaImage as Image } from '@/components/ui/media-image';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  emptyTiktokVideoValues,
  type TiktokVideoFormValues,
} from './tiktok-form-fields';
import { EditTiktokSheet } from './edit-tiktok-sheet';
import {
  createTiktokVideoAction,
  updateTiktokVideoAction,
  moveTiktokVideoAction,
  deleteTiktokVideoAction,
} from './actions';

type TiktokVideoRow = {
  id: string;
  url: string;
  caption: string | null;
  isActive: boolean;
  oembedTitle: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
};

export function TiktokTable({ videos }: { videos: TiktokVideoRow[] }) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [values, setValues] = useState<TiktokVideoFormValues>(
    emptyTiktokVideoValues
  );

  function openCreate() {
    setError(null);
    setValues(emptyTiktokVideoValues);
    setCreateOpen(true);
  }

  function submitCreate() {
    setError(null);
    const url = values.url.trim();
    if (!url) {
      setError('L’URL de la vidéo est obligatoire.');
      return;
    }
    const input = {
      url,
      caption: values.caption.trim() || undefined,
      isActive: values.isActive,
    };
    startTransition(async () => {
      const r = await createTiktokVideoAction(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCreateOpen(false);
    });
  }

  function toggleActive(video: TiktokVideoRow) {
    setError(null);
    setPendingId(video.id);
    startTransition(async () => {
      const r = await updateTiktokVideoAction(video.id, {
        isActive: !video.isActive,
      });
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function move(id: string, direction: 'up' | 'down') {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await moveTiktokVideoAction(id, direction);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function remove(video: TiktokVideoRow) {
    if (!window.confirm('Retirer cette vidéo TikTok ? Action irréversible.')) {
      return;
    }
    setError(null);
    setPendingId(video.id);
    startTransition(async () => {
      const r = await deleteTiktokVideoAction(video.id);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nouvelle vidéo
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aperçu</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Légende</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Ordre</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((video, i) => (
              <TableRow key={video.id}>
                <TableCell>
                  {video.thumbnailUrl ? (
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.caption ?? 'Miniature vidéo TikTok'}
                      width={40}
                      height={40}
                      className="size-10 rounded-md object-cover"
                    />
                  ) : (
                    <div className="size-10 rounded-md border border-dashed" />
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm font-medium">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {video.url}
                  </a>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                  {video.caption ?? '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    aria-label="Vidéo active"
                    checked={video.isActive}
                    disabled={pendingId === video.id}
                    onCheckedChange={() => toggleActive(video)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => move(video.id, 'up')}
                      disabled={pendingId === video.id || i === 0}
                      aria-label="Monter"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => move(video.id, 'down')}
                      disabled={
                        pendingId === video.id || i === videos.length - 1
                      }
                      aria-label="Descendre"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end">
                    <EditTiktokSheet video={video} />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(video)}
                      disabled={pendingId === video.id}
                      aria-label="Retirer la vidéo"
                    >
                      {pendingId === video.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {videos.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Aucune vidéo TikTok pour l’instant.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Nouvelle vidéo TikTok</SheetTitle>
            <SheetDescription>
              Colle l’URL de la vidéo TikTok (ex. depuis le bouton « Partager »
              sur l’app). Elle est ajoutée en fin de liste d’affichage.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <TiktokVideoFormFields values={values} onChange={setValues} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="mt-2" onClick={submitCreate} disabled={pending}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Ajouter
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
