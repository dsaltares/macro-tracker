import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <Link href={routes.home} className="font-semibold text-lg">
            {siteName}
          </Link>
          <ThemeToggle />
        </header>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
