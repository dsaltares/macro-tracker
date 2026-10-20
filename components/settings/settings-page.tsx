import type { ReactNode } from 'react';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
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
      start={<BackLink href={routes.settings} label="Back to settings" />}
    >
      {children}
    </AppPage>
  );
}
