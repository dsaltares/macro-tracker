import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppLogo } from '@/components/app-shell/app-logo';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export function TopBarFrame({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 -mt-[env(safe-area-inset-top)] border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-4">{children}</div>
    </header>
  );
}

export function TopBar({
  title,
  start,
  end,
}: {
  title: ReactNode;
  start?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <TopBarFrame>
      {start ?? (
        <Link href={routes.diary} aria-label={siteName} className="md:hidden">
          <AppLogo className="size-7" />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate font-semibold text-lg">{title}</h1>
      {end ? <div className="flex items-center gap-2">{end}</div> : null}
    </TopBarFrame>
  );
}
