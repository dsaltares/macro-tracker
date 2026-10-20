import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { WeightLog } from '@/components/body/weight-log';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Weight' };

export default function BodyPage() {
  return (
    <AppPage
      title="Weight"
      start={<BackLink href={routes.trends} label="Back to trends" />}
    >
      <WeightLog />
    </AppPage>
  );
}
