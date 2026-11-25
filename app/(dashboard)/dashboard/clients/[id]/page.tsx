import { notFound } from 'next/navigation';
import { requireRoleOrAnalyst, ROLE_GROUPS } from '@/lib/auth-helpers';
import { getCustomer } from '@/lib/customers';
import { fetchArdoise } from '@/lib/ardoise';
import { getLoyaltyCard } from '@/lib/loyalty';
import prisma from '@/lib/prisma';
import { TrustedCustomerCard } from '../trusted-customer-card';
import { LoyaltyToggleCard } from '../loyalty-toggle-card';
import { CustomerHeader } from './_components/customer-header';
import { CustomerStats } from './_components/customer-stats';
import { CreditPanel } from './_components/credit-panel';
import { LoyaltyCardPanel } from './_components/loyalty-card-panel';
import { OrdersHistory } from './_components/orders-history';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRoleOrAnalyst(['ADMIN']);
  // Le statut « client de confiance » et l'interrupteur fidélité sont réservés à
  // MANAGER_PLUS (les actions serveur refuseraient de toute façon) : on masque les
  // contrôles aux rôles en lecture seule plutôt que de leur offrir un bouton qui échoue.
  const canSetTrusted = ROLE_GROUPS.MANAGER_PLUS.includes(session.user.role);
  const { id } = await params;

  const [data, card, ardoise, creditEntries] = await Promise.all([
    getCustomer(id),
    getLoyaltyCard(id),
    fetchArdoise({ customerId: id }),
    prisma.customerCreditEntry.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  if (!data) notFound();
  const { customer, orders, stats } = data;

  const debtOwed = ardoise.totalOwed;

  return (
    <div className="space-y-6">
      <CustomerHeader customer={customer} />

      <CustomerStats customer={customer} stats={stats} debtOwed={debtOwed} />

      {canSetTrusted && (
        <TrustedCustomerCard
          customerId={customer.id}
          isTrusted={customer.isTrusted}
          trustedSince={customer.trustedSince}
          trustedNote={customer.trustedNote}
        />
      )}

      {canSetTrusted && (
        <LoyaltyToggleCard
          customerId={customer.id}
          loyaltyDisabled={customer.loyaltyDisabled}
          programEnabled={card?.settings.enabled ?? true}
        />
      )}

      {card && card.settings.enabled && (
        <LoyaltyCardPanel card={card} customerId={customer.id} />
      )}

      {(customer.creditBalance > 0 || creditEntries.length > 0) && (
        <CreditPanel balance={customer.creditBalance} entries={creditEntries} />
      )}

      <OrdersHistory orders={orders} />
    </div>
  );
}
