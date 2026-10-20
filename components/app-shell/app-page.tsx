import type { ComponentProps, ReactNode } from 'react';
import { TopBar } from '@/components/app-shell/top-bar';

export function AppPage({
  children,
  ...bar
}: ComponentProps<typeof TopBar> & { children: ReactNode }) {
  return (
    <>
      <TopBar {...bar} />
      <main className="flex flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </>
  );
}
