import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { NewRecipe } from '@/components/recipes/recipe-builder';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'New recipe' };

export default function NewRecipePage() {
  return (
    <AppPage
      title="New recipe"
      start={<BackLink href={routes.recipes} label="Back to recipes" />}
    >
      <NewRecipe />
    </AppPage>
  );
}
