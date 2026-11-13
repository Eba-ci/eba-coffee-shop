'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Masque ses enfants quand l'onglet `?tab=` actif est `tab`. `DepensesTabs`
 * écrit l'onglet par History API ; Next relaie ces changements à
 * `useSearchParams`, donc le masquage suit sans aller-retour serveur.
 */
export function HideOnTab({
  tab,
  children,
}: {
  tab: string | string[];
  children: ReactNode;
}) {
  const active = useSearchParams().get('tab');
  const hidden = Array.isArray(tab)
    ? tab.includes(active ?? '')
    : active === tab;
  return hidden ? null : <>{children}</>;
}
