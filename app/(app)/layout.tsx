import type { ReactNode } from 'react';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { Sidebar } from '@/components/app-shell/sidebar';
import { SiteFooter } from '@/components/site-footer';
import { requireProfile } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireProfile();
  return (
    <div className="md:pl-60">
      <Sidebar email={user.email} />
      <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-16 md:max-w-2xl md:pb-0">
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </div>
      <BottomNav />
    </div>
  );
}
