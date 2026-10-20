import type { ReactNode } from 'react';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { Sidebar } from '@/components/app-shell/sidebar';
import { requireProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireProfile();
  return (
    <div className="md:pl-60">
      <Sidebar account={user} />
      <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-16 md:max-w-2xl md:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
