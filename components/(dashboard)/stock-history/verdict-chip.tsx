'use client';

import { Chip } from '@heroui/react';
import type { StockExplanation } from '@/lib/stock-history/order-audit';

const COLORS = {
  ok: 'success',
  info: 'default',
  warn: 'warning',
  danger: 'danger',
} as const;

/** Verdict du contrôle commande ↔ journal : couleur selon la gravité, texte = l'explication. */
export function VerdictChip({
  explanation,
}: {
  explanation: Pick<StockExplanation, 'tone' | 'label'>;
}) {
  return (
    <Chip
      size="sm"
      variant="flat"
      color={COLORS[explanation.tone]}
      classNames={{
        base: 'h-auto max-w-full py-1',
        content: 'whitespace-normal',
      }}
    >
      {explanation.label}
    </Chip>
  );
}
