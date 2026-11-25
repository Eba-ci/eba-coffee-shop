import { Gift, Handshake } from 'lucide-react';
import { BackButton } from '@/components/(dashboard)/back-button';
import { formatPhoneForDisplay } from '@/lib/phone';
import { Badge } from '@/components/ui/badge';
import { CustomerFormSheet } from '../../customer-form';
import { MergeCustomerSheet } from '../../merge-customer-form';
import { dobFmt } from './helpers';
import { PrivacyActions } from './privacy-actions';
import type { CustomerData } from './types';

export function CustomerHeader({
  customer,
}: {
  customer: CustomerData['customer'];
}) {
  return (
    <div>
      <BackButton
        fallbackHref="/dashboard/clients"
        label="Clients"
        className="-ml-3 mb-2"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{customer.name ?? 'Client'}</h1>
            {customer.loyaltyDisabled && (
              <Badge variant="outline">
                <Gift className="h-3 w-3" aria-hidden="true" />
                Fidélité désactivée
              </Badge>
            )}
            {customer.isTrusted && (
              <Badge className="bg-blue-600">
                <Handshake className="h-3 w-3" aria-hidden="true" />
                Confiance
              </Badge>
            )}
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {formatPhoneForDisplay(customer.phone)}
          </p>
          {customer.dateOfBirth && (
            <p className="text-sm text-muted-foreground">
              🎂 Né(e) le {dobFmt.format(customer.dateOfBirth)}
            </p>
          )}
          {customer.isTrusted && customer.trustedNote && (
            <p className="mt-1 text-sm text-muted-foreground">
              {customer.trustedNote}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MergeCustomerSheet
            customerId={customer.id}
            customerName={customer.name}
            customerPhone={customer.phone}
          />
          <CustomerFormSheet
            mode="edit"
            id={customer.id}
            name={customer.name}
            phone={customer.phone}
            dateOfBirth={
              customer.dateOfBirth
                ? customer.dateOfBirth.toISOString().slice(0, 10)
                : null
            }
          />
        </div>
      </div>
      <div className="mt-3">
        <PrivacyActions
          customerId={customer.id}
          anonymized={customer.anonymizedAt !== null}
        />
      </div>
    </div>
  );
}
