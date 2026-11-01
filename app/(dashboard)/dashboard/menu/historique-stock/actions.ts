'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth-helpers';
import { recordStockBaseline } from '@/lib/stock-history/audit';

export type BaselineResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/** Pose le relevé de départ des stocks suivis qui n'ont encore aucune ligne de journal. */
export async function recordBaselineAction(): Promise<BaselineResult> {
  await requireManager();
  try {
    const count = await recordStockBaseline();
    revalidatePath('/dashboard/menu/historique-stock');
    return { ok: true, count };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Relevé impossible',
    };
  }
}
