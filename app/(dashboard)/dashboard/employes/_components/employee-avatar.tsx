// Avatar à initiales (#441) : cercle `bg-primary/10 text-primary`, décoratif
// (le nom est toujours écrit à côté). Partagé liste + fiche.

import { initials } from '@/lib/employees/format';
import { cn } from '@/lib/utils';

export function EmployeeAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary',
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
