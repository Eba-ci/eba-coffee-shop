'use client';

// Écouteur global du son « nouvelle commande » + cloche « en cuisine » de
// l'en-tête. Monté dans app/(dashboard)/layout.tsx : le son part quel que soit
// l'écran affiché, sans dépendre du push. Le flux SSE est partagé avec les vues
// caisse / cuisine (élection d'un leader par endpoint, `lib/hooks/sse-leader.ts`).
//
//  - Caisse (ADMIN, MANAGER, ASSISTANT_MANAGER, CASHIER) : toute nouvelle commande.
//  - Cuisine (KITCHEN) : nouvelle commande qui entre en préparation.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Badge, Button } from '@heroui/react';
import { Bell, VolumeX } from 'lucide-react';
import type { UserRole } from '@/generated/prisma/client';
import {
  ensureAudioReady,
  getAudioState,
  installAudioUnlock,
  playOrderSound,
  subscribeAudioState,
  useOrdersStream,
  useSoundPreference,
} from '@/lib/hooks/use-orders-stream';

type StreamOrder = { id: string; status: string };

const CASHIER_STREAM_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'CASHIER',
];
const PULSE_MS = 4_000;

const normalize = (raw: unknown) => raw as StreamOrder;
const getId = (o: StreamOrder) => o.id;
const NO_ORDERS: StreamOrder[] = [];

function streamFor(role: UserRole): 'kitchen' | 'cashier' | null {
  if (role === 'KITCHEN') return 'kitchen';
  return CASHIER_STREAM_ROLES.includes(role) ? 'cashier' : null;
}

export function OrderSoundListener({ role }: { role: UserRole }) {
  const kind = streamFor(role);
  if (!kind) return null;
  return <Listener kind={kind} />;
}

function Listener({ kind }: { kind: 'kitchen' | 'cashier' }) {
  const { soundEnabled, soundEnabledRef } = useSoundPreference();
  const audioState = useSyncExternalStore(
    subscribeAudioState,
    getAudioState,
    () => 'running' as const
  );
  // Le premier snapshot reçu décrit l'existant : il ne doit pas sonner.
  const primedRef = useRef(false);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    installAudioUnlock();
    return () => clearTimeout(pulseTimer.current);
  }, []);

  const { orders, lastSync } = useOrdersStream<StreamOrder>({
    endpoint:
      kind === 'kitchen' ? '/api/preparation/stream' : '/api/caisse/stream',
    initialOrders: NO_ORDERS,
    normalize,
    getId,
    onNewOrders: (newOrders) => {
      if (!primedRef.current) return;
      const relevant =
        kind === 'kitchen'
          ? newOrders.some((o) => o.status === 'PREPARING')
          : true;
      if (!relevant) return;
      if (soundEnabledRef.current) playOrderSound();
      setPulse(true);
      clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulse(false), PULSE_MS);
    },
  });

  useEffect(() => {
    if (lastSync) primedRef.current = true;
  }, [lastSync]);

  const inKitchen = orders.filter((o) => o.status === 'PREPARING').length;
  const label =
    inKitchen === 0
      ? 'Aucune commande en cuisine'
      : `${inKitchen} commande${inKitchen > 1 ? 's' : ''} en cuisine`;
  const blocked = soundEnabled && audioState === 'suspended';

  return (
    <>
      {blocked && (
        <Button
          size="sm"
          color="warning"
          variant="flat"
          startContent={<VolumeX className="h-4 w-4" aria-hidden />}
          onPress={() => {
            void ensureAudioReady().then((ready) => {
              if (ready) playOrderSound();
            });
          }}
        >
          Activer le son
        </Button>
      )}
      <Badge
        content={inKitchen}
        color="primary"
        isInvisible={inKitchen === 0}
        shape="circle"
      >
        <Button
          as={Link}
          href="/dashboard/preparation"
          isIconOnly
          variant="light"
          aria-label={label}
          className={`h-11 w-11 min-w-11 ${pulse ? 'motion-safe:animate-bounce' : ''}`}
          onPress={() => void ensureAudioReady()}
        >
          <Bell className="h-5 w-5" aria-hidden />
        </Button>
      </Badge>
    </>
  );
}
