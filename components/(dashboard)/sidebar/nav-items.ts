import type * as React from 'react';
import {
  BarChart3,
  Boxes,
  Briefcase,
  Calculator,
  ChefHat,
  ClipboardList,
  Contact,
  Landmark,
  RotateCcw,
  LayoutDashboard,
  NotebookPen,
  PiggyBank,
  Scale,
  Settings,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  Video,
  Vote,
  Wallet,
} from 'lucide-react';
import {
  ORDERS_VIEW_ROLES,
  PAYROLL_ROLES,
  REFUND_VIEW_ROLES,
} from '@/config/constants';
import type { UserRole } from '@/generated/prisma/client';

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
};

export const navItems: NavItem[] = [
  {
    label: 'Vue d’ensemble',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: [
      'ADMIN',
      'MANAGER',
      'ASSISTANT_MANAGER',
      'CASHIER',
      'COMPTABLE',
      'ANALYSTE',
    ],
  },
  {
    label: 'Statistiques',
    href: '/dashboard/statistiques',
    icon: BarChart3,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'COMPTABLE', 'ANALYSTE'],
  },
  {
    label: 'Dépenses',
    href: '/dashboard/depenses',
    icon: Wallet,
    roles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'],
  },
  {
    label: 'Employés',
    href: '/dashboard/employes',
    icon: Briefcase,
    // Même liste que la garde serveur (`requirePayroll`) : une seule source,
    // pour que l'entrée affichée et l'accès réellement autorisé ne divergent pas.
    roles: PAYROLL_ROLES,
  },
  {
    label: 'Investissements',
    href: '/dashboard/investissements',
    icon: PiggyBank,
    roles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'],
  },
  {
    label: 'Solde Jèko',
    href: '/dashboard/jeko',
    icon: Landmark,
    roles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'],
  },
  {
    label: 'Remboursements',
    href: '/dashboard/remboursements',
    icon: RotateCcw,
    roles: REFUND_VIEW_ROLES,
  },
  {
    label: 'Régularisations',
    href: '/dashboard/regularisations',
    icon: Scale,
    roles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'ANALYSTE'],
  },
  {
    label: 'Clients',
    href: '/dashboard/clients',
    icon: Contact,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'ANALYSTE'],
  },
  {
    label: 'Caisse',
    href: '/dashboard/caisse',
    icon: ShoppingBag,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'CASHIER'],
  },
  {
    label: 'Ardoise',
    href: '/dashboard/ardoise',
    icon: NotebookPen,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'CASHIER'],
  },
  {
    label: 'Préparation',
    href: '/dashboard/preparation',
    icon: ChefHat,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'CASHIER', 'KITCHEN'],
  },
  {
    label: 'Commandes',
    href: '/dashboard/commandes',
    icon: ClipboardList,
    // Même liste que la garde serveur (`requireOrdersView`) : une seule source,
    // pour que l'entrée affichée et l'accès réellement autorisé ne divergent pas.
    roles: ORDERS_VIEW_ROLES,
  },
  {
    label: 'Clôture',
    href: '/dashboard/cloture',
    icon: Calculator,
    roles: [
      'ADMIN',
      'MANAGER',
      'ASSISTANT_MANAGER',
      'CASHIER',
      'COMPTABLE',
      'ANALYSTE',
    ],
  },
  {
    label: 'Menu',
    href: '/dashboard/menu',
    icon: UtensilsCrossed,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'CASHIER'],
  },
  {
    label: 'Inventaire',
    href: '/dashboard/inventaire',
    icon: Boxes,
    roles: [
      'ADMIN',
      'MANAGER',
      'ASSISTANT_MANAGER',
      'CASHIER',
      'KITCHEN',
      'ANALYSTE',
    ],
  },
  {
    label: 'Sondages',
    href: '/dashboard/sondages',
    icon: Vote,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'ANALYSTE'],
  },
  {
    label: 'TikTok',
    href: '/dashboard/tiktok',
    icon: Video,
    roles: ['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER', 'ANALYSTE'],
  },
  {
    label: 'Paramètres',
    href: '/dashboard/parametres',
    icon: Settings,
    roles: ['ADMIN'],
  },
  {
    label: 'Utilisateurs',
    href: '/dashboard/utilisateurs',
    icon: Users,
    roles: ['ADMIN'],
  },
];

export function isItemActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Administration';
    case 'MANAGER':
      return 'Gérance';
    case 'ASSISTANT_MANAGER':
      return 'Gérance adjointe';
    case 'COMPTABLE':
      return 'Comptabilité';
    case 'CASHIER':
      return 'Caisse';
    case 'KITCHEN':
      return 'Préparation';
    case 'ANALYSTE':
      return 'Analyste';
    default:
      return 'Staff';
  }
}
