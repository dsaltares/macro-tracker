import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { FoodBrowser } from '@/components/foods/food-browser';
import { FoodsNav } from '@/components/foods/foods-nav';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Search foods' };

export default function FoodSearchPage() {
  return (
    <AppPage title="Foods">
      <FoodsNav current={routes.foodSearch} />
      <FoodBrowser />
    </AppPage>
  );
}
