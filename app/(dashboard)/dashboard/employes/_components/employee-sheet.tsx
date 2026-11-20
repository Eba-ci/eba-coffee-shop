'use client';

// Gabarit commun des tiroirs Employés (#441). Même cadre que les tiroirs
// Salaires : pleine largeur et `dvh` sur mobile (clavier compris), largeur
// bornée dès `sm`, en-tête titre + description, corps défilant, barre d'action
// collée en bas. Cibles ≥ 44 px (`h-11`).

import type { ReactNode } from 'react';
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export const EMPLOYEE_SHEET_CLASS =
  'h-dvh w-full max-w-none gap-0 p-0 sm:max-w-md';

export function EmployeeSheetHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <SheetHeader className="border-b p-5 pr-14">
      <SheetTitle className="text-lg">{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
      {children}
    </SheetHeader>
  );
}

export function EmployeeSheetBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 space-y-5 overflow-y-auto p-5">
      {children}
    </div>
  );
}

export function EmployeeSheetActions({ children }: { children: ReactNode }) {
  return (
    <SheetFooter className="border-t bg-background p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </SheetFooter>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}
