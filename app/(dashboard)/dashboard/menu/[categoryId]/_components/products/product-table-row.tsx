'use client';

import Link from 'next/link';
import { Reorder, useDragControls } from 'framer-motion';
import { MediaImage as Image } from '@/components/ui/media-image';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { ProductRowActions } from '../../product-row-actions';
import { StockBadge } from '@/components/(dashboard)/stock-badge';
import type { ProductRow } from './types';
import { priceFmt } from './types';
import { ProductStatusBadges } from './product-status-badges';

export function ProductTableRow({
  product: p,
  categoryId,
  isFirst,
  isLast,
  canReorder,
  reduceMotion,
  onDrop,
}: {
  product: ProductRow;
  categoryId: string;
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  reduceMotion: boolean;
  onDrop: () => void;
}) {
  // `dragListener={false}` + poignée dédiée : un glisser démarré dans la ligne rendrait interrupteurs et liens inutilisables.
  const controls = useDragControls();
  const couts = p.coutMatiere + p.coutEmballage;
  const marge = p.price - couts;
  const pct = p.price > 0 ? Math.round((marge / p.price) * 100) : 0;

  return (
    <Reorder.Item
      as="tr"
      value={p}
      drag={canReorder ? 'y' : false}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      layout="position"
      // `prefers-reduced-motion` : le réagencement devient instantané, mais le
      // glisser reste fonctionnel — réduire le mouvement n'est pas retirer une
      // fonctionnalité.
      transition={reduceMotion ? { duration: 0 } : undefined}
      className="border-b transition-colors hover:bg-muted/50"
    >
      <TableCell className="w-8 pr-0">
        <button
          type="button"
          disabled={!canReorder}
          onPointerDown={(e) => canReorder && controls.start(e)}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Déplacer ${p.name}`}
          title={
            canReorder
              ? `Déplacer ${p.name}`
              : 'Effacez les filtres pour réordonner'
          }
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {p.imageUrl ? (
          <Image
            src={p.imageUrl}
            alt={p.name}
            width={48}
            height={48}
            className="size-12 rounded-md object-cover"
          />
        ) : (
          <div className="size-12 rounded-md bg-muted" />
        )}
      </TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/dashboard/menu/${categoryId}/produits/${p.id}`}
          className="hover:underline"
        >
          {p.name}
        </Link>
        {/* Le statut disparaît sous lg : on garde l'essentiel sous le nom. */}
        <span className="mt-1 flex flex-wrap gap-1 lg:hidden">
          <ProductStatusBadges product={p} />
        </span>
      </TableCell>
      <TableCell className="tabular-nums">
        {priceFmt.format(p.price)} FCFA
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
        {couts > 0 ? (
          <span>{priceFmt.format(couts)} FCFA</span>
        ) : (
          <span className="text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {couts > 0 && p.price > 0 ? (
          <span
            className={
              pct >= 50
                ? 'text-sm font-medium text-green-600'
                : pct >= 20
                  ? 'text-sm font-medium text-yellow-600'
                  : 'text-sm font-medium text-destructive'
            }
          >
            {priceFmt.format(marge)} F ({pct}%)
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <StockBadge stockQuantity={p.stockQuantity} />
          <Link
            href={`/dashboard/menu/historique-stock?resource=${p.id}`}
            className="inline-flex min-h-6 items-center px-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Historique
          </Link>
          {!!p.pending && (
            <span
              className="text-xs text-amber-700 dark:text-amber-400"
              title="Quantité déjà demandée par des commandes non payées"
            >
              (dont {p.pending} en attente)
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductStatusBadges product={p} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hidden md:inline-flex"
          >
            <Link href={`/dashboard/menu/${categoryId}/produits/${p.id}`}>
              Modifier
            </Link>
          </Button>
          <ProductRowActions
            id={p.id}
            name={p.name}
            available={p.available}
            featured={p.featured}
            stockQuantity={p.stockQuantity}
            isFirst={isFirst}
            isLast={isLast}
            canReorder={canReorder}
            statsHref={`/dashboard/menu/${categoryId}/produits/${p.id}?onglet=stats`}
          />
        </div>
      </TableCell>
    </Reorder.Item>
  );
}
