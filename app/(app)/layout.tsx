import type { ReactNode } from 'react';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { SiteFooter } from '@/components/site-footer';
import { requireProfile } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireProfile();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col pb-16">
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
