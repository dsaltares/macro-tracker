import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NewRecipe,
  noIngredients,
  RecipeBuilder,
} from '@/components/recipes/recipe-builder';
import { noIngredientsYet } from '@/components/recipes/recipe-nutrition';
import { noRecipesYet, Recipes } from '@/components/recipes/recipes';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { addIngredient, createRecipe, findRecipe } from '@/lib/db/recipes';
import { serveApi } from '@/test/api';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = serveApi({ signedInAs: 'user-1' });

type User = ReturnType<typeof renderUi>['user'];

const seeding = (): FoodWriteContext => {
  let ids = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
  };
};

const seedKitchen = async () => {
  const db = api.database();
  const context = seeding();
  const oats = await insertFood(
    db,
    {
      source: 'ciqual',
      source_id: '9310',
      barcode: null,
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: {
        energy_kcal: 379,
        protein: 13.2,
        carbohydrate: 60.6,
        fat: 6.5,
      },
      portions: [{ label: '1 cup', grams: 80 }],
    },
    context,
  );
  const milk = await insertFood(
    db,
    {
      source: 'ciqual',
      source_id: '19041',
      barcode: null,
      name: 'Semi-skimmed milk',
      brand: null,
      quantity_label: null,
      nutrients: {
        energy_kcal: 46,
        protein: 3.3,
        carbohydrate: 4.8,
        fat: 1.6,
      },
      portions: [],
    },
    context,
  );
  const porridge = await createRecipe(
    db,
    'user-1',
    { name: 'Porridge', servings: 2, cookedWeightG: null, notes: null },
    context,
  );
  return { db, context, oats, milk, porridge };
};

const seedPorridge = async () => {
  const kitchen = await seedKitchen();
  const { db, context, oats, milk, porridge } = kitchen;
  await addIngredient(
    db,
    'user-1',
    {
      recipeId: porridge,
      ingredient: { kind: 'food', foodId: oats },
      portion: '1 cup',
      quantity: 1,
    },
    context,
  );
  await addIngredient(
    db,
    'user-1',
    {
      recipeId: porridge,
      ingredient: { kind: 'food', foodId: milk },
      portion: '100 g',
      quantity: 2,
    },
    context,
  );
  return kitchen;
};

const renderBuilder = (recipeId: string) =>
  renderUi(<RecipeBuilder recipeId={recipeId} />, { wrap: api.wrap });

const ingredientList = async () =>
  within(await screen.findByRole('region', { name: 'Ingredients' })).findByRole(
    'list',
  );

const ingredientNames = async () =>
  within(await ingredientList())
    .getAllByRole('listitem')
    .map(
      (item) => within(item).getAllByRole('button')[0]?.firstChild?.textContent,
    );

const amountIn = (section: string, label: string) => {
  const region = screen.getByRole('region', { name: section });
  const terms = within(region).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(region).getAllByRole('definition')[index]?.textContent;
};

const sheet = () => screen.getByRole('dialog', { name: 'Add ingredient' });

const openSheet = async (user: User) => {
  await user.click(
    await screen.findByRole('button', { name: 'Add ingredient' }),
  );
  return screen.findByRole('dialog', { name: 'Add ingredient' });
};

const savedIngredients = async (recipeId: string) =>
  (await findRecipe(api.database(), 'user-1', recipeId))?.ingredients.map(
    ({ name, portionLabel, quantity, grams }) => ({
      name,
      portionLabel,
      quantity,
      grams,
    }),
  );

describe('Recipes', () => {
  it('lists the recipes, each with its servings, linking to its builder', async () => {
    const { porridge } = await seedKitchen();
    renderUi(<Recipes />, { wrap: api.wrap });

    const link = await screen.findByRole('link', { name: /Porridge/ });
    expect(link).toHaveTextContent('2 servings');
    expect(link).toHaveAttribute('href', `/foods/recipes/${porridge}`);
    expect(screen.getByRole('link', { name: 'New recipe' })).toHaveAttribute(
      'href',
      '/foods/recipes/new',
    );
  });

  it('says where recipes appear before there are any', async () => {
    renderUi(<Recipes />, { wrap: api.wrap });

    expect(await screen.findByText(noRecipesYet)).toBeInTheDocument();
  });
});

describe('NewRecipe', () => {
  it('creates the recipe and opens its builder', async () => {
    const { user } = renderUi(<NewRecipe />, { wrap: api.wrap });

    await user.type(screen.getByLabelText('Name'), 'Chilli');
    await user.clear(screen.getByLabelText('Servings'));
    await user.type(screen.getByLabelText('Servings'), '4');
    await user.type(screen.getByLabelText('Cooked weight (g)'), '1200');
    await user.click(screen.getByRole('button', { name: 'Create recipe' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
    const [recipe] = await api
      .database()
      .selectFrom('recipes')
      .selectAll()
      .execute();
    expect(recipe).toMatchObject({
      name: 'Chilli',
      servings: 4,
      cooked_weight_g: 1200,
    });
    expect(router.replace).toHaveBeenCalledWith(`/foods/recipes/${recipe?.id}`);
  });

  it('asks for a name', async () => {
    const { user } = renderUi(<NewRecipe />, { wrap: api.wrap });

    await user.click(screen.getByRole('button', { name: 'Create recipe' }));

    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
  });
});

describe('RecipeBuilder', () => {
  it('adds a food found in search at the chosen amount', async () => {
    const { porridge } = await seedKitchen();
    const { user } = renderBuilder(porridge);

    expect(await screen.findByText(noIngredients)).toBeInTheDocument();
    expect(screen.getByText(noIngredientsYet)).toBeInTheDocument();
    await openSheet(user);
    await user.type(
      within(sheet()).getByRole('searchbox', { name: 'Search ingredients' }),
      'oats',
    );
    await user.click(
      await within(sheet()).findByRole('button', { name: /Rolled oats/ }),
    );
    const step = await within(sheet()).findByRole('region', {
      name: 'Rolled oats',
    });
    await user.clear(within(step).getByLabelText('Quantity'));
    await user.type(within(step).getByLabelText('Quantity'), '1.5');
    await user.selectOptions(within(step).getByLabelText('Portion'), '1 cup');
    await user.click(
      within(step).getByRole('button', { name: 'Add to recipe' }),
    );

    expect(await ingredientNames()).toEqual(['Rolled oats']);
    expect(
      screen.queryByRole('dialog', { name: 'Add ingredient' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1.5 × 1 cup · 120 g')).toBeInTheDocument();
    expect(await savedIngredients(porridge)).toEqual([
      { name: 'Rolled oats', portionLabel: '1 cup', quantity: 1.5, grams: 120 },
    ]);
    expect(amountIn('Per serving', 'Energy')).toBe('227 kcal');
    expect(amountIn('Per 100 g', 'Energy')).toBe('379 kcal');
  });

  it('adds another recipe from the recipes tab, never the recipe itself', async () => {
    const { db, context, oats, porridge } = await seedKitchen();
    const granola = await createRecipe(
      db,
      'user-1',
      { name: 'Granola', servings: 10, cookedWeightG: null, notes: null },
      context,
    );
    await addIngredient(
      db,
      'user-1',
      {
        recipeId: granola,
        ingredient: { kind: 'food', foodId: oats },
        portion: '100 g',
        quantity: 5,
      },
      context,
    );
    const { user } = renderBuilder(porridge);

    await openSheet(user);
    await user.click(within(sheet()).getByRole('tab', { name: 'Recipes' }));
    const choice = await within(sheet()).findByRole('button', {
      name: /Granola/,
    });
    expect(
      within(sheet()).queryByRole('button', { name: /Porridge/ }),
    ).not.toBeInTheDocument();
    await user.click(choice);
    const step = await within(sheet()).findByRole('region', {
      name: 'Granola',
    });
    expect(within(step).getByLabelText('Portion')).toHaveValue('1 serving');
    await user.click(
      within(step).getByRole('button', { name: 'Add to recipe' }),
    );

    expect(await ingredientNames()).toEqual(['Granola']);
    expect(await savedIngredients(porridge)).toEqual([
      { name: 'Granola', portionLabel: '1 serving', quantity: 1, grams: 50 },
    ]);
  });

  it('says why a recipe cannot go in', async () => {
    const { db, context, oats, porridge } = await seedKitchen();
    const breakfast = await createRecipe(
      db,
      'user-1',
      { name: 'Big breakfast', servings: 1, cookedWeightG: null, notes: null },
      context,
    );
    await addIngredient(
      db,
      'user-1',
      {
        recipeId: porridge,
        ingredient: { kind: 'food', foodId: oats },
        portion: '1 cup',
        quantity: 1,
      },
      context,
    );
    await addIngredient(
      db,
      'user-1',
      {
        recipeId: breakfast,
        ingredient: { kind: 'recipe', recipeId: porridge },
        portion: '1 serving',
        quantity: 1,
      },
      context,
    );
    const { user } = renderBuilder(porridge);

    await openSheet(user);
    await user.click(within(sheet()).getByRole('tab', { name: 'Recipes' }));
    await user.click(
      await within(sheet()).findByRole('button', { name: /Big breakfast/ }),
    );
    const step = await within(sheet()).findByRole('region', {
      name: 'Big breakfast',
    });
    await user.click(
      await within(step).findByRole('button', { name: 'Add to recipe' }),
    );

    expect(
      await within(step).findByText(
        'A recipe can contain a recipe, but that one cannot contain another',
      ),
    ).toBeInTheDocument();
  });

  it('removes an ingredient, and the summary with it', async () => {
    const { porridge } = await seedPorridge();
    const { user } = renderBuilder(porridge);

    await user.click(
      await screen.findByRole('button', { name: 'Remove Semi-skimmed milk' }),
    );

    await vi.waitFor(async () =>
      expect(await ingredientNames()).toEqual(['Rolled oats']),
    );
    expect(amountIn('Per serving', 'Energy')).toBe('152 kcal');
    await user.click(
      screen.getByRole('button', { name: 'Remove Rolled oats' }),
    );

    expect(await screen.findByText(noIngredients)).toBeInTheDocument();
    expect(screen.getByText(noIngredientsYet)).toBeInTheDocument();
    expect(await savedIngredients(porridge)).toEqual([]);
  });

  it('sums the ingredients per serving and per 100 g, following the servings and cooked weight as they are typed', async () => {
    const { porridge } = await seedPorridge();
    const { user } = renderBuilder(porridge);

    await screen.findByRole('region', { name: 'Per serving' });
    expect(screen.getByText('Makes 280 g')).toBeInTheDocument();
    expect(amountIn('Per serving', 'Energy')).toBe('198 kcal');
    expect(amountIn('Per serving', 'Protein')).toBe('8.6 g');
    expect(amountIn('Per 100 g', 'Energy')).toBe('141 kcal');

    await user.clear(screen.getByLabelText('Servings'));
    await user.type(screen.getByLabelText('Servings'), '4');
    expect(amountIn('Per serving', 'Energy')).toBe('99 kcal');
    expect(amountIn('Per 100 g', 'Energy')).toBe('141 kcal');

    await user.type(screen.getByLabelText('Cooked weight (g)'), '500');
    expect(screen.getByText('Makes 500 g')).toBeInTheDocument();
    expect(amountIn('Per serving', 'Energy')).toBe('99 kcal');
    expect(amountIn('Per 100 g', 'Energy')).toBe('79 kcal');

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    await vi.waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/foods/recipes'),
    );
    expect(await findRecipe(api.database(), 'user-1', porridge)).toMatchObject({
      servings: 4,
      cookedWeightG: 500,
    });
  });

  it('changes an ingredient’s amount', async () => {
    const { porridge } = await seedPorridge();
    const { user } = renderBuilder(porridge);

    await user.click(
      await screen.findByRole('button', { name: /^Semi-skimmed milk/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Semi-skimmed milk',
    });
    const quantity = await within(dialog).findByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('3 × 100 g · 300 g')).toBeInTheDocument();
    expect(amountIn('Per serving', 'Energy')).toBe('221 kcal');
  });

  it('moves an ingredient up and down', async () => {
    const { porridge } = await seedPorridge();
    const { user } = renderBuilder(porridge);

    expect(
      await screen.findByRole('button', { name: 'Move Rolled oats up' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Move Rolled oats down' }),
    );

    await vi.waitFor(async () =>
      expect(await ingredientNames()).toEqual([
        'Semi-skimmed milk',
        'Rolled oats',
      ]),
    );
    expect((await savedIngredients(porridge))?.map(({ name }) => name)).toEqual(
      ['Semi-skimmed milk', 'Rolled oats'],
    );
  });
});
