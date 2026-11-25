'use server';

// Actions serveur fidélité d'un client (fiche CRM). Fichier à part des actions
// générales du CRM (`./actions.ts`) pour rester court.

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth-helpers';
import { setCustomerLoyaltyDisabled } from '@/lib/customer-loyalty';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Désactive / réactive la fidélité d'un client : gel du gain, de l'affichage et de
 * l'usage de ses récompenses (rien n'est effacé). `requireManager` (MANAGER_PLUS),
 * comme le statut « client de confiance » : ça change ce que le client obtient.
 *
 * Revalide aussi la caisse : la proposition de récompense y est lue depuis la fiche.
 */
export async function setCustomerLoyaltyDisabledAction(
  id: string,
  loyaltyDisabled: boolean
): Promise<ActionResult> {
  await requireManager();
  try {
    const customer = await setCustomerLoyaltyDisabled(id, loyaltyDisabled);
    revalidatePath('/dashboard/clients');
    revalidatePath(`/dashboard/clients/${customer.id}`);
    revalidatePath('/dashboard/caisse');
    return { ok: true, id: customer.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur inattendue',
    };
  }
}
