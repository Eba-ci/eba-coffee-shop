'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/dashboard/menu', label: 'Catégories' },
  { href: '/dashboard/menu/plannings', label: 'Plannings récurrents' },
  { href: '/dashboard/menu/stock-supplements', label: 'Stock par goût' },
  { href: '/dashboard/menu/historique-stock', label: 'Historique du stock' },
  { href: '/dashboard/menu/extras-globaux', label: 'Extras globaux' },
  { href: '/dashboard/menu/reglages', label: 'Réglages' },
];

/** `/dashboard/menu` est le préfixe de toutes les autres routes : il ne doit
 * être « actif » que sur lui-même et sur les pages catégorie/produit, qui lui
 * appartiennent. Les sous-sections nommées, elles, matchent par préfixe. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard/menu') {
    return !LINKS.some(
      (l) => l.href !== href && pathname.startsWith(`${l.href}`)
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MenuSubNav() {
  const pathname = usePathname();

  // Les 4 liens ne tiennent pas sur une ligne étroite : la barre passe à la
  // ligne. Un défilement horizontal élargirait la page ou, une fois borné,
  // masquerait des liens sans rien laisser paraître.
  return (
    <nav aria-label="Sections du menu">
      <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {LINKS.map(({ href, label }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
