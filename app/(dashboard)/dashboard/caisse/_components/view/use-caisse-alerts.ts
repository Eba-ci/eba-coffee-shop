'use client';

import { useEffect, useRef, useState } from 'react';
import type { CashierOrder } from '@/lib/cashier-queue';
import type { OrderStatus } from '@/generated/prisma/client';

export function useCaisseAlerts({
  initialQueue,
  queue,
}: {
  initialQueue: CashierOrder[];
  queue: CashierOrder[];
}) {
  // Amorcé depuis le snapshot initial pour ne pas notifier au premier rendu.
  const prevStatusRef = useRef<Map<string, OrderStatus>>(
    new Map(initialQueue.map((o) => [o.id, o.status]))
  );
  const readyFlashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  // Commandes qui viennent de passer « prête » : bandeau éphémère en caisse.
  const [readyFlash, setReadyFlash] = useState<number[] | null>(null);

  // Notification DISTINCTE « Commande prête » : la cuisine a marqué une commande
  // prête (→ READY). On compare au statut précédent pour ne réagir qu'à la
  // transition (jamais au chargement ni à un simple re-render). Carillon dédié
  // + bandeau éphémère.
  useEffect(() => {
    const prev = prevStatusRef.current;
    const newlyReady: CashierOrder[] = [];
    for (const o of queue) {
      const before = prev.get(o.id);
      if (before !== undefined && before !== 'READY' && o.status === 'READY') {
        newlyReady.push(o);
      }
    }
    prevStatusRef.current = new Map(queue.map((o) => [o.id, o.status]));

    if (newlyReady.length > 0) {
      // Réaction à un changement du flux SSE externe (transition → READY) : le
      // setState est intentionnel ici (notification en direct), pas un dérivé
      // d'état recalculable pendant le rendu.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReadyFlash(newlyReady.map((o) => o.dailyNumber));
      if (readyFlashTimer.current) clearTimeout(readyFlashTimer.current);
      readyFlashTimer.current = setTimeout(() => setReadyFlash(null), 10_000);
    }
  }, [queue]);

  useEffect(
    () => () => {
      if (readyFlashTimer.current) clearTimeout(readyFlashTimer.current);
    },
    []
  );

  return { readyFlash, setReadyFlash };
}
