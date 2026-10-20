import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/account/sign-out-button';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export function OnboardingPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <Link href={routes.home} className="font-semibold text-lg">
            {siteName}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton variant="outline" size="lg" className="h-11 px-3" />
          </div>
        </header>
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
