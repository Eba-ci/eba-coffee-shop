import type { ReactNode } from 'react';
import { SheetHeader } from '@/components/ui/sheet';

/**
 * Gabarit commun des tiroirs Salaires : pleine largeur et `dvh` sur mobile
 * (le clavier ne masque plus les champs), largeur bornée dès `sm`, défilement
 * interne, marge basse tenant compte de la zone sûre (iOS).
 */
export const SALARY_SHEET_CLASS =
  'h-dvh w-full max-w-none gap-0 overflow-y-auto p-0 sm:max-w-md';

/** En-tête : `pr-12` laisse la place au bouton de fermeture. */
export function SalarySheetHeader({ children }: { children: ReactNode }) {
  return <SheetHeader className="pr-12">{children}</SheetHeader>;
}

export function SalarySheetBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-4 px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
