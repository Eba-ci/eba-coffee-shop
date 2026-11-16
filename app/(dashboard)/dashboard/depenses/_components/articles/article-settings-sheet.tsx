'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BASE_UNITS } from '@/lib/expense-units';
import { setExpenseArticleSettingsAction } from '../../actions';
import type { ArticleMeta, InventoryItemOption } from './types';
import { selectClass } from './format';
import { InventoryRefCombobox } from './inventory-ref-combobox';

/** Réglages d'un article : unité de base, suivi de stock, emplacement, prix de référence en gros. */
export function ArticleSettingsSheet({
  article,
  inventoryItems,
  linkedElsewhere,
  onClose,
}: {
  article: ArticleMeta;
  inventoryItems: InventoryItemOption[];
  linkedElsewhere: Set<string>;
  onClose: () => void;
}) {
  const [baseUnit, setBaseUnit] = useState(article.baseUnit ?? '');
  const [trackInventory, setTrackInventory] = useState(article.trackInventory);
  const [inventoryItemId, setInventoryItemId] = useState(
    article.inventoryItemId ?? ''
  );
  // Référentiel d'inventaire local : les références créées à la volée
  // (« ajouter directement ») s'ajoutent ici pour être proposées aussitôt.
  const [items, setItems] = useState(inventoryItems);
  const [location, setLocation] = useState(article.location ?? '');
  const [wholesaleRefPrice, setWholesaleRefPrice] = useState(
    article.wholesaleRefPrice != null ? String(article.wholesaleRefPrice) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectableItems = items.filter(
    (i) => !linkedElsewhere.has(i.id) || i.id === article.inventoryItemId
  );

  function save() {
    setError(null);
    const price = wholesaleRefPrice.trim()
      ? Math.round(Number(wholesaleRefPrice))
      : null;
    if (wholesaleRefPrice.trim() && (!Number.isFinite(price) || price! < 0)) {
      setError('Prix de référence invalide');
      return;
    }
    startTransition(async () => {
      const r = await setExpenseArticleSettingsAction(article.id, {
        baseUnit: baseUnit || null,
        trackInventory,
        inventoryItemId: trackInventory ? inventoryItemId || null : null,
        location: location.trim() || null,
        wholesaleRefPrice: price,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Réglages — {article.name}</SheetTitle>
          <SheetDescription>
            Unité de base, suivi de stock et emplacement de l’article.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="art-unit">Unité de base</Label>
            <select
              id="art-unit"
              className={selectClass}
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value)}
            >
              <option value="">—</option>
              {BASE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Suivi de stock</p>
              <p className="text-xs text-muted-foreground">
                Article rattaché à une référence d’inventaire.
              </p>
            </div>
            <Switch
              checked={trackInventory}
              onCheckedChange={setTrackInventory}
              aria-label="Suivi de stock"
            />
          </div>
          {trackInventory && (
            <div className="space-y-1.5">
              <Label htmlFor="art-inventory-item">Référence d’inventaire</Label>
              <InventoryRefCombobox
                items={selectableItems}
                value={inventoryItemId}
                onChange={setInventoryItemId}
                baseUnit={baseUnit || null}
                onCreated={(item) => {
                  setItems((prev) => [...prev, item]);
                  setInventoryItemId(item.id);
                }}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="art-location">Emplacement (optionnel)</Label>
            <Input
              id="art-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex. Réserve, cuisine…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="art-price">
              Prix de référence en gros (FCFA, optionnel)
            </Label>
            <Input
              id="art-price"
              type="number"
              min={0}
              inputMode="numeric"
              value={wholesaleRefPrice}
              onChange={(e) => setWholesaleRefPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
