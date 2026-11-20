'use client';

import { useState, useTransition } from 'react';
import { Loader2, Settings2 } from 'lucide-react';
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
import type { ExpenseSettings } from '@/lib/expense-settings';
import { updateExpenseSettingsAction } from './actions';

const FIELDS: {
  key: keyof ExpenseSettings;
  label: string;
  help: string;
  min: number;
  max?: number;
}[] = [
  {
    key: 'freqWindowDays',
    label: 'Fenêtre de fréquence (jours)',
    help: 'Période glissante utilisée pour compter les achats récurrents d’un article.',
    min: 1,
    max: 365,
  },
  {
    key: 'freqMinCount',
    label: 'Nombre min. d’achats',
    help: 'Achats minimum sur la fenêtre pour considérer un article comme récurrent.',
    min: 1,
  },
  {
    key: 'cumulativeMinAmount',
    label: 'Montant cumulé min. (FCFA)',
    help: 'Seuil de cumul sur la fenêtre pour signaler un article comme poste notable.',
    min: 0,
  },
  {
    key: 'priceAberrantFactor',
    label: 'Facteur de prix aberrant',
    help: 'Multiplicateur du prix habituel au-delà duquel une ligne est signalée.',
    min: 1,
  },
  {
    key: 'draftTtlMinutes',
    label: 'Durée de vie d’un brouillon (minutes)',
    help: 'Délai avant expiration d’un brouillon d’achat/dépense non confirmé.',
    min: 1,
    max: 120,
  },
  {
    key: 'recurrenceSuggestMinHits',
    label: 'Occurrences min. pour suggérer une récurrence',
    help: 'Nombre d’achats similaires avant de proposer de créer une dépense récurrente.',
    min: 1,
  },
];

export function ExpenseSettingsButton({
  settings,
}: {
  settings: ExpenseSettings;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="mr-1.5 h-4 w-4" />
        Réglages
      </Button>
      {open && (
        <ExpenseSettingsSheet
          settings={settings}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ExpenseSettingsSheet({
  settings,
  onClose,
}: {
  settings: ExpenseSettings;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])]))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const parsed: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = Math.round(Number(values[f.key]));
      if (
        !Number.isFinite(n) ||
        n < f.min ||
        (f.max !== undefined && n > f.max)
      ) {
        setError(`${f.label} : valeur invalide`);
        return;
      }
      parsed[f.key] = n;
    }
    startTransition(async () => {
      const r = await updateExpenseSettingsAction(parsed);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Réglages des dépenses</SheetTitle>
          <SheetDescription>
            Seuils utilisés pour la détection de fréquence, de cumul, de prix
            aberrant et la durée de vie des brouillons d’achat.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`settings-${f.key}`}>{f.label}</Label>
              <Input
                id={`settings-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                inputMode="numeric"
                value={values[f.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">{f.help}</p>
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
