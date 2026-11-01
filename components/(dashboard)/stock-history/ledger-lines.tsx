// Rendu compact d'une commande dans le registre du stock : une ligne par
// ressource (produit en titre, goûts/suppléments dessous), UN seul état par
// ligne, et les mouvements bruts repliés. Partagé par la carte « Stock » du
// détail d'une commande et par le registre (fiche produit, page d'audit).

import type { ResourceLine } from '@/lib/stock-history/order-audit';
import type { LedgerMovement } from '@/lib/stock-history/order-audit-query';
import { STOCK_REASON_LABELS } from '@/lib/stock-history/types';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Abidjan',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export type LineGroup = {
  product: string;
  /** Ligne du produit lui-même (absente si seuls ses goûts sont décomptés). */
  own: ResourceLine | null;
  /** Goûts / suppléments : `sub` = « Groupe · Option », sans le nom du produit. */
  children: { sub: string; line: ResourceLine }[];
};

/** Regroupe « Produit · Groupe · Option » sous le produit, sans répéter son nom. */
export function groupLines(lines: ResourceLine[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const line of lines) {
    const [product, ...rest] = line.label.split(' · ');
    const key = product ?? line.label;
    let g = groups.get(key);
    if (!g) {
      g = { product: key, own: null, children: [] };
      groups.set(key, g);
    }
    if (line.kind === 'PRODUCT' || rest.length === 0) g.own = line;
    else g.children.push({ sub: rest.join(' · '), line });
  }
  return [...groups.values()];
}

/** Texte d'état d'une ligne. « Attendu » n'apparaît jamais : seul l'écart se dit. */
export function lineQuantity(
  line: ResourceLine,
  judged: boolean
): { text: string; tone: 'ok' | 'muted' | 'danger' | 'warn' } {
  if (!judged) {
    return line.consumed > 0
      ? { text: `−${line.consumed}`, tone: 'ok' }
      : { text: `à retirer : ${line.needed}`, tone: 'muted' };
  }
  if (line.status === 'missing') {
    return {
      text: `−${line.consumed} sur ${line.needed} à retirer`,
      tone: 'danger',
    };
  }
  if (line.status === 'excess') {
    return { text: `−${line.consumed} sur ${line.needed}`, tone: 'warn' };
  }
  return { text: `−${line.consumed}`, tone: 'ok' };
}

const TONE_CLASS = {
  ok: 'font-medium text-foreground',
  muted: 'text-muted-foreground',
  danger: 'font-semibold text-danger',
  warn: 'font-semibold text-warning',
} as const;

/** Stock suivi : « 3 → 2 » ; illimité : pastille. Lu sur les mouvements de la ressource. */
function stockHint(line: ResourceLine, movements: LedgerMovement[]) {
  const own = movements.filter((m) => m.resourceId === line.resourceId);
  if (own.length === 0) return null;
  const first = own[0];
  const last = own[own.length - 1];
  if (!first || !last) return null;
  if (last.after === null) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        illimité
      </span>
    );
  }
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {first.before ?? '∞'} → {last.after}
    </span>
  );
}

function Row({
  name,
  line,
  judged,
  movements,
  child,
}: {
  name: string;
  line: ResourceLine;
  judged: boolean;
  movements: LedgerMovement[];
  child?: boolean;
}) {
  const q = lineQuantity(line, judged);
  return (
    <li
      className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${child ? 'pl-4 text-muted-foreground' : ''}`}
    >
      <span className={child ? 'text-sm' : 'text-sm font-medium'}>
        {child ? `+ ${name}` : name}
      </span>
      <span className="flex items-baseline gap-2">
        {stockHint(line, movements)}
        <span className={`text-sm tabular-nums ${TONE_CLASS[q.tone]}`}>
          {q.text}
        </span>
      </span>
    </li>
  );
}

export function StockLines({
  lines,
  movements,
  judged,
}: {
  lines: ResourceLine[];
  movements: LedgerMovement[];
  judged: boolean;
}) {
  if (lines.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-1">
      {groupLines(lines).flatMap((g) => [
        g.own ? (
          <Row
            key={`${g.product}:own`}
            name={g.product}
            line={g.own}
            judged={judged}
            movements={movements}
          />
        ) : (
          <li key={`${g.product}:title`} className="text-sm font-medium">
            {g.product}
          </li>
        ),
        ...g.children.map((c) => (
          <Row
            key={`${c.line.kind}:${c.line.resourceId}`}
            name={c.sub}
            line={c.line}
            judged={judged}
            movements={movements}
            child
          />
        )),
      ])}
    </ul>
  );
}

/** Mouvements bruts (heure, motif, personne), repliés par défaut. */
export function MovementsDetails({
  movements,
}: {
  movements: LedgerMovement[];
}) {
  if (movements.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none py-1.5 text-xs text-primary">
        Détail des mouvements ({movements.length})
      </summary>
      <ul className="mt-1 space-y-1.5">
        {movements.map((m) => (
          <li key={m.id} className="text-xs">
            <span className="tabular-nums text-muted-foreground">
              {dateFmt.format(m.createdAt)}
            </span>{' '}
            {m.label} ·{' '}
            <span
              className={
                (m.delta ?? 0) < 0
                  ? 'font-semibold text-danger'
                  : 'font-semibold text-success'
              }
            >
              {(m.delta ?? 0) > 0 ? `+${m.delta}` : (m.delta ?? 0)}
            </span>{' '}
            · {STOCK_REASON_LABELS[m.reason]}
            {m.actorName ? ` · ${m.actorName}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}
