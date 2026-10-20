import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { RecipeBuilder } from '@/components/recipes/recipe-builder';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Edit recipe' };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppPage
      title="Edit recipe"
      start={<BackLink href={routes.recipes} label="Back to recipes" />}
    >
      <RecipeBuilder recipeId={id} />
    </AppPage>
  );
}
