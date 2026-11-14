// En-tête commun des écrans Employés (#441) : même structure sur la liste et
// sur la fiche — titre, sous-titre court, action primaire à droite. Une ligne
// en bureau, empilé sous `sm`. Le rendu ne contient aucun champ de saisie : la
// saisie vit uniquement dans les tiroirs (règle des écrans Employés).

import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action}
        </div>
      )}
    </header>
  );
}
