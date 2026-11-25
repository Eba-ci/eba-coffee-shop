// lib/customer-loyalty.ts
//
// Active / désactive la fidélité d'UN client (`Customer.loyaltyDisabled`).
// L'interrupteur global reste `LoyaltySettings.enabled` (Paramètres) ; la règle de
// gel commune aux deux est dans `lib/loyalty/active.ts`.
//
// Désactiver ne supprime rien : tampons et récompenses restent intacts, ils ne
// sont simplement plus gagnés, affichés ni utilisables. Les réactiver les rend tels
// quels. Surface DÉDIÉE (comme `setCustomerTrusted`), pas un champ de
// `updateCustomer`.

import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { setCustomerLoyaltyDisabledSchema } from '@/lib/schemas/customer';

export async function setCustomerLoyaltyDisabled(
  id: string,
  loyaltyDisabled: boolean
) {
  const data = setCustomerLoyaltyDisabledSchema.parse({ loyaltyDisabled });

  try {
    // Le gain (`awardLoyaltyForOrder`) relit ce drapeau sous `FOR UPDATE` : un
    // simple `update` suffit, la bascule est vue par la commande suivante.
    return await prisma.customer.update({
      where: { id },
      data: { loyaltyDisabled: data.loyaltyDisabled },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      throw new Error('Client introuvable.');
    }
    throw err;
  }
}
