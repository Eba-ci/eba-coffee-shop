'use client';

import { Chip } from '@heroui/react';
import {
  STOCK_REASON_LABELS,
  type StockReason,
} from '@/lib/stock-history/types';

type ChipColor =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger';

const COLORS: Record<StockReason, ChipColor> = {
  ORDER_KITCHEN: 'primary',
  HOLD_RESERVE: 'default',
  HOLD_RELEASE: 'default',
  ORDER_EDIT_ADD: 'primary',
  ORDER_EDIT_REMOVE: 'default',
  SHORTAGE_COVER: 'secondary',
  REFUND_RESTOCK: 'success',
  EXPIRY_RELEASE: 'default',
  MANUAL_RESTOCK: 'success',
  MANUAL_SET: 'warning',
  BULK_SET: 'warning',
  FORM_EDIT: 'warning',
  CREATED: 'default',
  OPTION_REMOVED: 'danger',
  BASELINE: 'default',
  ANOMALY: 'danger',
};

export function ReasonChip({ reason }: { reason: StockReason }) {
  return (
    <Chip size="sm" variant="flat" color={COLORS[reason]}>
      {STOCK_REASON_LABELS[reason]}
    </Chip>
  );
}
