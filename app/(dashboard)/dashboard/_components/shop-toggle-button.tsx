'use client';

import { useState, useTransition } from 'react';
import { Store, StoreIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setShopClosedToday } from '../actions';

/** Bascule « Fermer la boutique » / « Ouvrir la boutique » pour aujourd'hui. */
export function ShopToggleButton({
  initialClosed,
}: {
  initialClosed: boolean;
}) {
  const [closed, setClosed] = useState(initialClosed);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setShopClosedToday(!closed);
      if (res.ok) setClosed(res.closed);
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={closed ? 'default' : 'destructive'}
        onClick={toggle}
        disabled={isPending}
        aria-pressed={closed}
      >
        {closed ? (
          <Store className="mr-1.5 h-4 w-4" />
        ) : (
          <StoreIcon className="mr-1.5 h-4 w-4" />
        )}
        {closed ? 'Ouvrir la boutique' : 'Fermer la boutique'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
