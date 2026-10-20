import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { LogWeightCard } from '@/components/body/log-weight-card';

export const metadata: Metadata = { title: 'Diary' };

export default function DiaryPage() {
  return (
    <AppPage title="Diary">
      <LogWeightCard />
      <p className="text-muted-foreground text-sm">
        What you eat each day, meal by meal, will be here.
      </p>
    </AppPage>
  );
}
