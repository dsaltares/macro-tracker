import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { FoodsNav } from '@/components/foods/foods-nav';
import { Recipes } from '@/components/recipes/recipes';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Recipes' };

export default function RecipesPage() {
  return (
    <AppPage title="Foods">
      <FoodsNav current={routes.recipes} />
      <Recipes />
    </AppPage>
  );
}
