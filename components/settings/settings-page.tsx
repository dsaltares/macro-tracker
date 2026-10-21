import type { ReactNode } from 'react';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { routes } from '@/lib/routes';

export function SettingsPage({
  title,
  end,
  children,
}: {
  title: string;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppPage
      title={title}
      start={<BackLink href={routes.settings} label="Back to settings" />}
      end={end}
    >
      {children}
    </AppPage>
  );
}
