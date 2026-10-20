import { IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { routes } from '@/lib/routes';

export function SettingsPage({
  email,
  title,
  children,
}: {
  email: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <AppHeader email={email} />
      <div className="flex flex-col gap-1">
        <Link
          href={routes.settings}
          className="-ml-1 flex min-h-11 w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
        >
          <IconChevronLeft className="size-4" />
          Settings
        </Link>
        <h1 className="font-semibold text-2xl">{title}</h1>
      </div>
      {children}
    </main>
  );
}
