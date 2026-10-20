import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { TrendsOverview } from '@/components/trends/trends-overview';

export const metadata: Metadata = { title: 'Trends' };

export default function TrendsPage() {
  return (
    <AppPage title="Trends">
      <TrendsOverview />
    </AppPage>
  );
}
