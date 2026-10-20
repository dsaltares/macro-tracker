import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { FoodsNav } from '@/components/foods/foods-nav';
import { UserFoods } from '@/components/foods/user-foods';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Foods' };

export default function FoodsPage() {
  return (
    <AppPage title="Foods">
      <FoodsNav current={routes.foods} />
      <UserFoods />
    </AppPage>
  );
}
