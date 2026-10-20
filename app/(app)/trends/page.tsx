import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';

export const metadata: Metadata = { title: 'Trends' };

export default function TrendsPage() {
  return (
    <AppPage title="Trends">
      <p className="text-muted-foreground text-sm">
        How your intake changes over weeks and months will be here.
      </p>
    </AppPage>
  );
}
