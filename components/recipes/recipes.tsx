'use client';

import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FormError } from '@/components/auth/fields';
import { formatQuantity } from '@/components/diary/amounts';
import {
  foodRowClass,
  Message,
  ResultsSkeleton,
} from '@/components/diary/food-search-results';
import { buttonVariants } from '@/components/ui/button';
import type { RecipeSummary } from '@/lib/db/recipes';
import { recipeRoute, routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const recipesFailed = 'Your recipes could not be loaded. Try again.';

export const noRecipesYet =
  'Recipes you build appear here, to log by the serving or the gram.';

export const noRecipeMatches = (query: string) =>
  `None of your recipes match “${query}”.`;

export const recipeMatches = (name: string, query: string) =>
  name.toLocaleLowerCase('en').includes(query.trim().toLocaleLowerCase('en'));

export const servingsOf = ({ servings }: Pick<RecipeSummary, 'servings'>) =>
  `${formatQuantity(servings)} ${servings === 1 ? 'serving' : 'servings'}`;

export function RecipeRowContent({ recipe }: { recipe: RecipeSummary }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate font-medium">{recipe.name}</span>
      <span className="truncate text-muted-foreground text-xs">
        {servingsOf(recipe)}
      </span>
    </span>
  );
}

function RecipeList() {
  const trpc = useTRPC();
  const recipes = useQuery(trpc.recipe.list.queryOptions());

  if (recipes.isPending) {
    return <ResultsSkeleton />;
  }
  if (recipes.isError) {
    return <FormError>{recipesFailed}</FormError>;
  }
  if (recipes.data.length === 0) {
    return <Message>{noRecipesYet}</Message>;
  }

  return (
    <ul className="-mx-4 flex flex-col divide-y">
      {recipes.data.map((recipe) => (
        <li key={recipe.id}>
          <Link href={recipeRoute(recipe.id)} className={foodRowClass}>
            <RecipeRowContent recipe={recipe} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Recipes() {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={routes.newRecipe}
        className={cn(buttonVariants({ size: 'lg' }), 'h-11 self-end')}
      >
        <IconPlus className="size-5" />
        New recipe
      </Link>
      <RecipeList />
    </div>
  );
}
