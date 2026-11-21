import React from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { redirect } from 'next/navigation';
import { getCurrentSession, ROLE_GROUPS } from '@/lib/auth-helpers';
import type { UserRole } from '@/generated/prisma/client';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { DashboardSidebar } from '@/components/(dashboard)/dashboard-sidebar';
import { PushNotificationToggle } from '@/components/(dashboard)/push-notification-toggle';
import { AssistantButton } from '@/components/(dashboard)/assistant/assistant-button';
import { canUseAssistant } from '@/lib/ai/assistant/tools';
import { openRouterConfig } from '@/lib/ai/config';
import { OrderSoundListener } from '@/components/(dashboard)/order-sound-listener';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login');
  }

  const role = session.user.role as UserRole;
  if (!ROLE_GROUPS.DASHBOARD.includes(role)) {
    redirect('/');
  }

  return (
    <NuqsAdapter>
      <SidebarProvider>
        <DashboardSidebar
          user={{ name: session.user.name, email: session.user.email }}
          role={role}
        />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="flex-1 text-sm font-medium">Dashboard</span>
            {canUseAssistant(role) && openRouterConfig() && <AssistantButton />}
            <OrderSoundListener role={role} />
            <PushNotificationToggle />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NuqsAdapter>
  );
}
