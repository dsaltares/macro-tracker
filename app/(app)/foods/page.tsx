import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { UserFoods } from '@/components/foods/user-foods';

export const metadata: Metadata = { title: 'Foods' };

export default function FoodsPage() {
  return (
    <AppPage title="Foods">
      <UserFoods />
    </AppPage>
  );
}
