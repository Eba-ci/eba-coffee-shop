'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LoyaltySettings } from '@/lib/loyalty-settings';
import { saveLoyaltySettings } from './actions';

export function LoyaltySettingsForm({ initial }: { initial: LoyaltySettings }) {
  const [s, setS] = useState<LoyaltySettings>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    msg: string;
  } | null>(null);

  function num<K extends keyof LoyaltySettings>(key: K, value: string) {
    setS((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  }

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const r = await saveLoyaltySettings(s);
      setFeedback(
        r.ok
          ? { kind: 'success', msg: 'Réglages enregistrés.' }
          : { kind: 'error', msg: r.error }
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fidélité — carte à tampons</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2">
          <Switch
            id="loyalty-enabled"
            checked={s.enabled}
            onCheckedChange={(v) => setS((p) => ({ ...p, enabled: v }))}
          />
          <Label htmlFor="loyalty-enabled">Programme actif</Label>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Désactivé, tout est gelé : plus de tampon gagné, plus de récompense
          proposée ni utilisable, pour tous les clients. Rien n&apos;est effacé
          : tampons et récompenses reviennent à la réactivation. Pour un seul
          client, utilisez l&apos;interrupteur de sa fiche.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            id="minOrderAmount"
            label="Montant min. / tampon (FCFA)"
            value={s.minOrderAmount}
            onChange={(v) => num('minOrderAmount', v)}
          />
          <Field
            id="stampsPerCard"
            label="Tampons par carte"
            value={s.stampsPerCard}
            onChange={(v) => num('stampsPerCard', v)}
          />
          <Field
            id="tier1Stamps"
            label="Palier intermédiaire (tampons)"
            value={s.tier1Stamps}
            onChange={(v) => num('tier1Stamps', v)}
          />
          <Field
            id="tier1RewardCap"
            label="Récompense palier interm. (FCFA)"
            value={s.tier1RewardCap}
            onChange={(v) => num('tier1RewardCap', v)}
          />
          <Field
            id="tier2RewardCap"
            label="Récompense carte complète (FCFA)"
            value={s.tier2RewardCap}
            onChange={(v) => num('tier2RewardCap', v)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="oneStampPerDay"
            checked={s.oneStampPerDay}
            onCheckedChange={(v) => setS((p) => ({ ...p, oneStampPerDay: v }))}
          />
          <Label htmlFor="oneStampPerDay">
            Limiter à 1 tampon par jour et par client
          </Label>
        </div>

        {feedback && (
          <p
            className={
              feedback.kind === 'success'
                ? 'text-sm text-green-600'
                : 'text-sm text-destructive'
            }
          >
            {feedback.msg}
          </p>
        )}

        <Button onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
