// Angles morts du stock : ce que le journal ne suffit pas à expliquer
// (cf. lib/stock-history/audit.ts). Composant serveur ; seul le bouton de
// relevé de départ est interactif.

import Link from 'next/link';
import type { StockAudit } from '@/lib/stock-history/audit';
import { BaselineButton } from './baseline-button';

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

function ResourceLink({ id, label }: { id: string; label: string }) {
  return (
    <Link
      href={`?resource=${encodeURIComponent(id)}`}
      className="py-1 hover:underline"
    >
      {label}
    </Link>
  );
}

export function AuditPanel({
  audit,
  canFix,
}: {
  audit: StockAudit;
  canFix: boolean;
}) {
  const clean =
    audit.drifts.length === 0 &&
    audit.untracked.length === 0 &&
    audit.negatives.length === 0 &&
    audit.orphanHolds.length === 0 &&
    audit.recentAnomalies === 0;

  if (clean) {
    return (
      <section aria-label="Angles morts" className="rounded-lg border p-3">
        <h2 className="text-sm font-semibold">Angles morts</h2>
        <p className="text-sm text-muted-foreground">
          Rien à signaler : le stock actuel correspond au journal.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Angles morts" className="space-y-3">
      <h2 className="text-sm font-semibold">Angles morts</h2>

      {audit.untracked.length > 0 && (
        <Block
          title={`${audit.untracked.length} stock(s) sans relevé de départ`}
          hint="Ces éléments ont un stock suivi mais aucune ligne de journal : on ne sait pas d'où vient leur quantité."
        >
          {canFix && <BaselineButton count={audit.untracked.length} />}
        </Block>
      )}

      {audit.drifts.length > 0 && (
        <Block
          title={`${audit.drifts.length} écart(s) avec le journal`}
          hint="Le stock actuel diffère de la dernière valeur journalisée : une écriture est passée sans trace (ou une vente vient d'avoir lieu)."
        >
          <ul className="space-y-1 text-sm">
            {audit.drifts.slice(0, 20).map((d) => (
              <li key={d.resourceId} className="flex flex-wrap gap-x-3">
                <ResourceLink id={d.resourceId} label={d.label} />
                <span className="tabular-nums text-muted-foreground">
                  journal : {d.expected} · réel : <strong>{d.actual}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {audit.negatives.length > 0 && (
        <Block
          title={`${audit.negatives.length} stock(s) négatif(s)`}
          hint="Un stock sous zéro ne devrait pas exister : à corriger en fixant la quantité réelle."
        >
          <ul className="space-y-1 text-sm">
            {audit.negatives.map((n) => (
              <li key={n.resourceId}>
                <ResourceLink id={n.resourceId} label={n.label} /> : {n.stock}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {audit.orphanHolds.length > 0 && (
        <Block
          title={`${audit.orphanHolds.length} réservation(s) orpheline(s)`}
          hint="Réservées pour une commande, mais le produit ou le goût n'existe plus (supprimé ou renommé) : ce stock ne sera jamais rendu."
        >
          <ul className="space-y-1 text-sm">
            {audit.orphanHolds.slice(0, 20).map((h) => (
              <li key={`${h.orderId}:${h.resourceId}`}>
                <Link
                  href={`/dashboard/commandes/${h.orderId}`}
                  className="py-1 text-primary hover:underline"
                >
                  Commande
                </Link>{' '}
                · {h.quantity} unité(s)
              </li>
            ))}
          </ul>
        </Block>
      )}

      {audit.recentAnomalies > 0 && (
        <Block
          title={`${audit.recentAnomalies} anomalie(s) ces 30 derniers jours`}
          hint="Stock qui n'a pas pu être rendu (goût désactivé ou renommé)."
        >
          <Link
            href="?reason=ANOMALY"
            className="py-1 text-sm text-primary hover:underline"
          >
            Voir les anomalies
          </Link>
        </Block>
      )}
    </section>
  );
}
