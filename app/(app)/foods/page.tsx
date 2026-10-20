import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';

export const metadata: Metadata = { title: 'Foods' };

export default function FoodsPage() {
  return (
    <AppPage title="Foods">
      <p className="text-muted-foreground text-sm">
        The foods you create will be here.
      </p>
    </AppPage>
  );
}
