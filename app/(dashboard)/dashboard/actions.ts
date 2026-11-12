'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth-helpers';
import {
  getPickupSettings,
  updatePickupSettings,
} from '@/lib/pickup-settings-db';
import { setTodayClosed } from '@/lib/pickup-today-toggle';
import { todayDateString } from '@/lib/timezone';

/** Ferme (`closed: true`) ou rouvre la boutique pour aujourd'hui. */
export async function setShopClosedToday(
  closed: boolean
): Promise<{ ok: true; closed: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const settings = await getPickupSettings();
    await updatePickupSettings(
      setTodayClosed(settings, todayDateString(), closed)
    );
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/parametres');
    revalidatePath('/carte');
    return { ok: true, closed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}
