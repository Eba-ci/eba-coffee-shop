'use client';

// Détail d'un remboursement dans un panneau latéral, ouvert par `?open=<id>`.

import { parseAsString, useQueryState } from 'nuqs';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatAbidjanDateTime } from '@/lib/timezone';
import { PAYMENT_MODE_LABELS } from '@/lib/payment-modes';
import { REFUND_REASON_LABELS } from '@/lib/schemas/refund';
import {
  REFUND_DELIVERY_LABELS,
  REFUND_SOURCE_LABELS,
  REFUND_STATUS_HINTS,
  REFUND_STATUS_LABELS,
} from '@/lib/refunds/labels';
import { RefundStatusBadge } from './refund-badges';
import { RefundActions } from './refund-actions';
import { ConvertCredit } from './convert-credit';
import type { RefundDetailData, RefundViewer } from './refund-types';

const fmt = new Intl.NumberFormat('fr-FR');
const date = (iso: string | null) =>
  iso ? formatAbidjanDateTime(new Date(iso)) : '—';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function RefundDetailSheet({
  refund,
  viewer,
}: {
  refund: RefundDetailData | null;
  viewer: RefundViewer;
}) {
  const [open, setOpen] = useQueryState(
    'open',
    parseAsString.withOptions({ shallow: false, scroll: false })
  );

  return (
    <Sheet
      open={Boolean(open && refund)}
      onOpenChange={(next) => {
        if (!next) void setOpen(null);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {refund && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3 text-2xl tabular-nums">
                {fmt.format(refund.amount)} F
                <RefundStatusBadge status={refund.status} />
              </SheetTitle>
              <SheetDescription>
                {REFUND_STATUS_HINTS[refund.status]}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <RefundActions
                refund={refund}
                viewer={viewer}
                onDone={() => {}}
              />

              {refund.convertibleCredit > 0 && viewer.canRequest && (
                <ConvertCredit refund={refund} onDone={() => {}} />
              )}

              <dl className="divide-y rounded-lg border px-3">
                <Row
                  label="Commande"
                  value={
                    <Link
                      href={`/dashboard/commandes/${refund.orderId}`}
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      #{String(refund.dailyNumber).padStart(3, '0')} ·{' '}
                      {refund.orderRef}
                    </Link>
                  }
                />
                <Row label="Client" value={refund.customerName ?? '—'} />
                {refund.creditSourceId && (
                  <Row
                    label="Nature"
                    value={
                      <Link
                        href={`/dashboard/remboursements?open=${refund.creditSourceId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        Conversion d’avoir en argent
                      </Link>
                    }
                  />
                )}
                {refund.convertibleCredit > 0 && (
                  <Row
                    label="Avoir convertible"
                    value={`${fmt.format(refund.convertibleCredit)} F`}
                  />
                )}
                <Row
                  label="Motif"
                  value={REFUND_REASON_LABELS[refund.reason]}
                />
                {refund.note && <Row label="Note" value={refund.note} />}
                <Row
                  label="Envoi"
                  value={REFUND_DELIVERY_LABELS[refund.delivery]}
                />
                <Row
                  label="Canal"
                  value={PAYMENT_MODE_LABELS[refund.channel]}
                />
                {refund.phone && <Row label="Numéro" value={refund.phone} />}
                <Row
                  label="Origine"
                  value={REFUND_SOURCE_LABELS[refund.source]}
                />
                <Row label="Demandé par" value={refund.requestedBy ?? '—'} />
                <Row label="Demandé le" value={date(refund.createdAt)} />
                {refund.approvedAt && (
                  <Row
                    label="Validé"
                    value={`${refund.approvedBy ?? '—'} · ${date(refund.approvedAt)}`}
                  />
                )}
                {refund.paidAt && (
                  <Row label="Parti le" value={date(refund.paidAt)} />
                )}
                {refund.feeFcfa > 0 && (
                  <Row
                    label="Frais du transfert"
                    value={`${fmt.format(refund.feeFcfa)} F`}
                  />
                )}
                <Row
                  label="Remise en stock"
                  value={
                    refund.restockItems
                      ? refund.stockRestoredAt
                        ? 'Faite'
                        : 'Demandée'
                      : 'Non'
                  }
                />
              </dl>

              {refund.lines.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Articles remboursés
                  </h3>
                  <ul className="divide-y rounded-lg border text-sm">
                    {refund.lines.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span>
                          {l.quantity} × {l.name}
                          {l.kind === 'SUPPLEMENT' && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (supplément)
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums">
                          {fmt.format(l.amount)} F
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Journal</h3>
                <ol className="space-y-2 border-l pl-4 text-sm">
                  {refund.events.map((e) => (
                    <li key={e.id}>
                      <p className="font-medium">
                        {REFUND_STATUS_LABELS[e.to]}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {e.actor ?? 'Système'} · {date(e.at)}
                        </span>
                      </p>
                      {e.note && (
                        <p className="text-muted-foreground">{e.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
