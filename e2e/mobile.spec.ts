import { expect, type Page, test } from '@playwright/test';
import {
  completeOnboarding,
  freshEmail,
  linkMailedTo,
  signUp,
  tab,
} from './auth.ts';
import { expectNoSeriousViolations } from './axe.ts';

test.skip(({ isMobile }) => !isMobile, 'the one-handed journey on a phone');

const addIngredient = async (
  page: Page,
  search: string,
  food: RegExp,
  grams: string,
) => {
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add ingredient' });
  await sheet
    .getByRole('searchbox', { name: 'Search ingredients' })
    .fill(search);
  await sheet.getByRole('button', { name: food }).first().click();
  const step = sheet.getByRole('region', { name: food });
  await step.getByLabel('Portion').selectOption('1 g');
  await step.getByLabel('Quantity').fill(grams);
  await step.getByRole('button', { name: 'Add to recipe' }).click();
  await expect(sheet).toBeHidden();
};

test('someone logs their weight, a food and a recipe on a phone, and every screen passes axe', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.goto(await linkMailedTo(email, /^Confirm your/));
  await completeOnboarding(page);
  await expect(page).toHaveURL('/diary');

  const logWeight = page.getByRole('region', { name: 'Log weight' });
  await expect(logWeight).toBeVisible();
  await expectNoSeriousViolations(page);
  await logWeight.getByLabel('Weight (kg)').fill('64.5');
  await logWeight.getByRole('button', { name: 'Log weight' }).click();
  await expect(logWeight).toBeHidden();

  const breakfast = page.getByRole('region', { name: 'Breakfast' });
  await breakfast.getByRole('button', { name: 'Add to breakfast' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add to breakfast' });
  const search = sheet.getByRole('searchbox', { name: 'Search foods' });
  await expect(search).toBeVisible();
  await expectNoSeriousViolations(page);
  await search.fill('nutella');
  await sheet.getByRole('button', { name: /^Nutella Ferrero/ }).click();
  const food = sheet.getByRole('region', { name: 'Nutella' });
  await food.getByLabel('Portion').selectOption('1 g');
  await food.getByLabel('Quantity').fill('20');
  await expect(
    food.getByRole('region', { name: 'Nutrients in 20 g' }),
  ).toContainText('108 kcal');
  await expectNoSeriousViolations(page);
  await food.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    breakfast.getByRole('button', { name: /Nutella/ }),
  ).toBeVisible();
  const totals = page.getByRole('region', { name: 'Day totals' });
  await expect(totals).toContainText('108 kcal');

  await tab(page, 'Foods').click();
  await page.getByRole('link', { name: 'Recipes' }).click();
  await page.getByRole('link', { name: 'New recipe' }).click();
  await expect(page).toHaveURL('/foods/recipes/new');
  await page.getByLabel('Name').fill('Porridge');
  await page.getByLabel('Servings').fill('2');
  await page.getByRole('button', { name: 'Create recipe' }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit recipe', level: 1 }),
  ).toBeVisible();
  await addIngredient(page, 'oats', /^Cereals, oats/, '80');
  await addIngredient(page, 'whole milk', /^Milk, whole/, '200');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page).toHaveURL('/foods/recipes');
  await expect(page.getByRole('link', { name: /Porridge/ })).toContainText(
    '2 servings',
  );

  await tab(page, 'Diary').click();
  const lunch = page.getByRole('region', { name: 'Lunch' });
  await lunch.getByRole('button', { name: 'Add to lunch' }).click();
  const lunchSheet = page.getByRole('dialog', { name: 'Add to lunch' });
  await lunchSheet.getByRole('tab', { name: 'Recipes' }).click();
  await lunchSheet.getByRole('button', { name: /Porridge/ }).click();
  const recipe = lunchSheet.getByRole('region', { name: 'Porridge' });
  await expect(recipe.getByLabel('Unit')).toHaveValue('servings');
  await expect(
    recipe.getByRole('region', { name: 'Nutrients in 140 g' }),
  ).toBeVisible();
  await recipe.getByRole('button', { name: 'Save' }).click();
  await expect(lunchSheet).toBeHidden();
  await expect(lunch.getByRole('button', { name: /Porridge/ })).toContainText(
    'Recipe',
  );

  await tab(page, 'Settings').click();
  await page.getByRole('link', { name: /^Goals/ }).click();
  await expect(page).toHaveURL('/settings/goals');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await expectNoSeriousViolations(page);

  await tab(page, 'Trends').click();
  const weight = page.getByRole('region', { name: 'Weight' });
  await expect(weight.getByRole('figure')).toBeVisible();
  await expectNoSeriousViolations(page);
  await weight.getByRole('link', { name: 'Weight log' }).click();
  await expect(page).toHaveURL('/body');
  await expect(page.getByRole('region', { name: 'Weight log' })).toContainText(
    '64.5 kg',
  );
});
