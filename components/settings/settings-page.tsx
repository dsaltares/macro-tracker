import { IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppPage } from '@/components/app-shell/app-page';
import { routes } from '@/lib/routes';

export function SettingsPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <AppPage
      title={title}
      start={
        <Link
          href={routes.settings}
          aria-label="Back to settings"
          className="-ml-3 flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="size-5" />
        </Link>
      }
    >
      {children}
    </AppPage>
  );
}
