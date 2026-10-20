import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EditUserFood,
  NewUserFood,
  notEditable,
} from '@/components/foods/user-food-editor';
import {
  barcodeTaken,
  compareWithLabel,
  hardToRead,
  saveFailed,
  unsurePrinted,
  unsureReading,
} from '@/components/foods/user-food-form';
import { shrinkPhoto, uploadPhoto } from '@/components/label-scan/photo';
import { findFood } from '@/lib/db/food-search';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import type { LabelReading } from '@/lib/domain/foods/label-reading';
import {
  aboveMaxPer100g,
  portionLabelTaken,
} from '@/lib/domain/foods/user-food';
import { serveApi } from '@/test/api';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

vi.mock('@/components/label-scan/photo', () => ({
  shrinkPhoto: vi.fn(),
  uploadPhoto: vi.fn(),
}));

const api = serveApi({ signedInAs: 'user-1' });

const seeding = (): FoodWriteContext => {
  let ids = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
  };
};

const seedOwnFood = () =>
  insertFood(
    api.database(),
    {
      source: 'user',
      owner_user_id: 'user-1',
      barcode: '3017620422003',
      name: 'Hazelnut spread',
      brand: 'Homemade',
      quantity_label: '350 g',
      nutrients: {
        energy_kcal: 540,
        fat: 31,
        sodium: 43,
        vitamin_e: 6.5,
      },
      portions: [{ label: '1 tsp', grams: 5 }],
    },
    seeding(),
  );

const ownFoods = () =>
  api
    .database()
    .selectFrom('foods')
    .select(['id', 'archived_at'])
    .where('owner_user_id', '=', 'user-1')
    .execute();

const savedFood = async () => {
  await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/foods'));
  const [own] = await ownFoods();
  if (own === undefined) {
    throw new Error('no food was saved');
  }
  const food = await findFood({ db: api.database(), userId: 'user-1' }, own.id);
  if (food === null) {
    throw new Error('the saved food cannot be read');
  }
  return food;
};

const renderNew = (barcode = '') =>
  renderUi(<NewUserFood barcode={barcode} />, { wrap: api.wrap });

const field = (label: string) => screen.getByLabelText(label);

const allNutrients = () =>
  screen.getByRole('button', { name: 'All nutrients' });

describe('NewUserFood', () => {
  it('saves the label per 100 g, salt as sodium', async () => {
    const { user } = renderNew();

    await user.type(field('Name'), 'Granola');
    await user.type(field('Energy (kcal)'), '450');
    await user.type(field('Fat (g)'), '18');
    await user.type(field('Salt (g)'), '0.5');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await savedFood()).toMatchObject({
      source: 'user',
      name: 'Granola',
      brand: null,
      barcode: null,
      nutrients: { energy_kcal: 450, fat: 18, sodium: 200 },
    });
  });

  it('converts amounts typed per serving to per 100 g', async () => {
    const { user } = renderNew();

    await user.type(field('Name'), 'Protein bar');
    await user.click(screen.getByRole('radio', { name: 'Per serving' }));
    await user.type(field('Serving size (g)'), '60');
    await user.type(field('Energy (kcal)'), '210');
    await user.type(field('Protein (g)'), '20');
    await user.type(field('Sugars (g)'), '1.5');
    await user.type(field('Salt (g)'), '0.3');
    await user.click(allNutrients());
    await user.type(field('Fibre (g)'), '7');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect((await savedFood()).nutrients).toEqual({
      energy_kcal: 350,
      protein: 33.33,
      sugars: 2.5,
      fibre: 11.67,
      sodium: 200,
    });
  });

  it('asks for the serving size before converting', async () => {
    const { user } = renderNew();

    await user.type(field('Name'), 'Protein bar');
    await user.click(screen.getByRole('radio', { name: 'Per serving' }));
    await user.type(field('Energy (kcal)'), '210');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText('Enter the serving size')).toBeVisible();
    expect(await ownFoods()).toEqual([]);
  });

  it('refuses an amount 100 g cannot hold once converted', async () => {
    const { user } = renderNew();

    await user.type(field('Name'), 'Butter');
    await user.click(screen.getByRole('radio', { name: 'Per serving' }));
    await user.type(field('Serving size (g)'), '10');
    await user.type(field('Fat (g)'), '12');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText(aboveMaxPer100g('fat'))).toBeVisible();
    expect(await ownFoods()).toEqual([]);
  });

  it('keeps every other nutrient behind All nutrients', async () => {
    const { user } = renderNew();

    expect(allNutrients()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Vitamin C (mg)')).not.toBeVisible();
    expect(screen.queryByLabelText('Sodium (mg)')).toBeNull();
    expect(screen.queryByLabelText('Energy (kcal)')).toBeVisible();

    await user.click(allNutrients());

    expect(allNutrients()).toHaveAttribute('aria-expanded', 'true');
    for (const group of [
      'Macros',
      'Fats',
      'Carbohydrates',
      'Minerals',
      'Vitamins',
      'Other',
    ]) {
      expect(screen.getByRole('group', { name: group })).toBeVisible();
    }
    await user.type(field('Name'), 'Orange juice');
    await user.type(field('Vitamin C (mg)'), '40');
    await user.type(field('Caffeine (mg)'), '0');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect((await savedFood()).nutrients).toEqual({
      vitamin_c: 40,
      caffeine: 0,
    });
  });

  it('opens All nutrients to show an error inside it', async () => {
    const { user } = renderNew();

    await user.click(allNutrients());
    await user.type(field('Iron (mg)'), '-1');
    await user.click(allNutrients());
    await user.type(field('Name'), 'Spinach');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText('Enter zero or more')).toBeVisible();
    expect(allNutrients()).toHaveAttribute('aria-expanded', 'true');
  });

  it('saves the portions listed, and refuses a label twice', async () => {
    const { user } = renderNew();

    await user.type(field('Name'), 'Bread');
    await user.click(screen.getByRole('button', { name: 'Add portion' }));
    await user.type(field('Portion 1 label'), '1 slice');
    await user.type(field('Portion 1 grams'), '35');
    await user.click(screen.getByRole('button', { name: 'Add portion' }));
    await user.type(field('Portion 2 label'), '1 slice');
    await user.type(field('Portion 2 grams'), '50');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText(portionLabelTaken)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove portion 2' }));
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect((await savedFood()).portions).toEqual([
      { id: expect.any(String), label: '1 slice', grams: 35, source: 'user' },
      { label: '100 g', grams: 100 },
      { label: '1 g', grams: 1 },
      { label: '1 ml', grams: 1 },
    ]);
  });

  it('starts from the barcode it is given, and refuses one already taken', async () => {
    await seedOwnFood();
    const { user } = renderNew('3017620422003');

    expect(field('Barcode')).toHaveValue('3017620422003');
    await user.type(field('Name'), 'Another spread');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText(barcodeTaken)).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('goes on to log the food it saved to the diary meal it came from', async () => {
    const { user } = renderUi(
      <NewUserFood barcode="" diary={{ date: '2026-10-19', meal: 'lunch' }} />,
      { wrap: api.wrap },
    );

    await user.type(field('Name'), 'Granola');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    const [own] = await ownFoods();
    expect(router.push).toHaveBeenCalledWith(
      `/diary?date=2026-10-19&meal=lunch&food=${own?.id}`,
    );
  });

  it('says so when the food cannot be saved', async () => {
    api.fails('food.create');
    const { user } = renderNew();

    await user.type(field('Name'), 'Granola');
    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await screen.findByText(saveFailed)).toBeVisible();
  });
});

const labelReading: LabelReading = {
  productName: { value: 'Oat biscuits', confidence: 0.95 },
  brand: { value: 'Mill Lane', confidence: 0.9 },
  netQuantity: { value: '300 g', confidence: 0.9 },
  servingSize: {
    label: '2 biscuits',
    amount: 25,
    unit: 'g',
    confidence: 0.8,
  },
  per100g: [
    { nutrient: 'energy_kj', printed: '2010', unit: 'kJ', confidence: 0.9 },
    { nutrient: 'fat', printed: '21', unit: 'g', confidence: 0.9 },
    { nutrient: 'salt', printed: '0,5', unit: 'g', confidence: 0.9 },
  ],
  perServing: [],
  notes: [],
};

describe('NewUserFood with label scanning', () => {
  const photo = new File([new Uint8Array(16)], 'label.jpg', {
    type: 'image/jpeg',
  });

  const renderScanning = (scanFirst = false) =>
    renderUi(
      <NewUserFood
        barcode="5000159407236"
        labelScanning
        scanFirst={scanFirst}
      />,
      { wrap: api.wrap },
    );

  it('offers no scan while label scanning is off, even when asked to start with one', () => {
    renderUi(<NewUserFood barcode="" scanFirst />, { wrap: api.wrap });

    expect(field('Name')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Scan a label instead' }),
    ).not.toBeInTheDocument();
  });

  it('starts with the camera when asked, and goes back to typing', async () => {
    const { user } = renderScanning(true);

    expect(
      screen.getByRole('region', { name: 'Scan a label' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Type it in instead' }),
    );

    expect(field('Barcode')).toHaveValue('5000159407236');
  });

  const scan = async (
    user: ReturnType<typeof renderScanning>['user'],
    reading: LabelReading,
  ) => {
    vi.mocked(shrinkPhoto).mockResolvedValue(photo);
    vi.mocked(uploadPhoto).mockResolvedValue({ read: true, reading });
    await user.click(
      screen.getByRole('button', { name: 'Scan a label instead' }),
    );
    await user.upload(screen.getByLabelText('Take a photo'), photo);
    await screen.findByLabelText('Name');
  };

  it('highlights a value it is unsure of with what the label printed, and saves the label per 100 g', async () => {
    const { user } = renderScanning();

    await scan(user, {
      ...labelReading,
      servingSize: { label: '1 bar', amount: 40, unit: 'g', confidence: 0.9 },
      per100g: [],
      perServing: [
        {
          nutrient: 'energy_kcal',
          printed: '180',
          unit: 'kcal',
          confidence: 0.9,
        },
        { nutrient: 'sugars', printed: '6,4', unit: 'g', confidence: 0.4 },
        { nutrient: 'salt', printed: '0,2', unit: 'g', confidence: 0.9 },
      ],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(compareWithLabel);
    expect(screen.getByRole('alert')).toHaveTextContent(hardToRead);
    expect(field('Sugars (g)')).toHaveValue(16);
    expect(field('Sugars (g)')).toHaveAccessibleDescription(
      unsurePrinted('6,4 g per serving'),
    );
    expect(field('Energy (kcal)')).not.toHaveAccessibleDescription();
    expect(field('Salt (g)')).not.toHaveAccessibleDescription();
    expect(field('Name')).not.toHaveAccessibleDescription();

    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect((await savedFood()).nutrients).toEqual({
      energy_kcal: 450,
      sugars: 16,
      sodium: 200,
    });
  });

  it('stops highlighting a value once it is corrected', async () => {
    const { user } = renderScanning();

    await scan(user, {
      ...labelReading,
      per100g: [
        { nutrient: 'sugars', printed: '12,5', unit: 'g', confidence: 0.4 },
      ],
    });
    expect(field('Sugars (g)')).toHaveAccessibleDescription(
      unsurePrinted('12,5 g'),
    );
    await user.clear(field('Sugars (g)'));
    await user.type(field('Sugars (g)'), '13.5');
    await user.tab();

    expect(field('Sugars (g)')).not.toHaveAccessibleDescription();
  });

  it('highlights the details and the serving it is unsure of, and lists its notes', async () => {
    const { user } = renderScanning();

    await scan(user, {
      ...labelReading,
      productName: { value: 'Oat biscuits', confidence: 0.5 },
      servingSize: {
        label: '2 biscuits',
        amount: 25,
        unit: 'g',
        confidence: 0.3,
      },
      per100g: [
        { nutrient: 'sodium', printed: '410', unit: 'mg', confidence: 0.6 },
      ],
      notes: ['The brand is cut off'],
    });

    expect(field('Name')).toHaveAccessibleDescription(unsureReading);
    expect(field('Brand')).toHaveAccessibleDescription('Optional');
    expect(field('Portion 1 label')).toHaveAccessibleDescription(unsureReading);
    expect(field('Portion 1 grams')).toHaveAccessibleDescription(unsureReading);
    expect(field('Salt (g)')).toHaveAccessibleDescription(
      unsurePrinted('410 mg sodium'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The brand is cut off');
  });

  it('shows no notice for a reading it is sure of', async () => {
    const { user } = renderScanning();

    await scan(user, labelReading);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fills the form from the label it reads, keeping the barcode, and saves it', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(photo);
    vi.mocked(uploadPhoto).mockResolvedValue({
      read: true,
      reading: labelReading,
    });
    const { user } = renderScanning();

    await user.click(
      screen.getByRole('button', { name: 'Scan a label instead' }),
    );
    await user.upload(screen.getByLabelText('Take a photo'), photo);

    expect(await screen.findByLabelText('Name')).toHaveValue('Oat biscuits');
    expect(field('Brand')).toHaveValue('Mill Lane');
    expect(field('Barcode')).toHaveValue('5000159407236');
    expect(field('Energy (kcal)')).toHaveValue(480.4);
    expect(field('Salt (g)')).toHaveValue(0.5);
    expect(
      screen.getByRole('button', { name: 'Scan the label again' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create food' }));

    expect(await savedFood()).toMatchObject({
      name: 'Oat biscuits',
      brand: 'Mill Lane',
      barcode: '5000159407236',
      quantityLabel: '300 g',
      nutrients: { energy_kcal: 480.4, fat: 21, sodium: 200 },
    });
  });
});

describe('EditUserFood', () => {
  const renderEdit = (foodId: string) =>
    renderUi(<EditUserFood foodId={foodId} />, { wrap: api.wrap });

  it('fills in the food and saves the change', async () => {
    const id = await seedOwnFood();
    const { user } = renderEdit(id);

    expect(await screen.findByLabelText('Name')).toHaveValue('Hazelnut spread');
    expect(field('Brand')).toHaveValue('Homemade');
    expect(field('Pack size')).toHaveValue('350 g');
    expect(field('Energy (kcal)')).toHaveValue(540);
    expect(field('Salt (g)')).toHaveValue(0.11);
    expect(allNutrients()).toHaveAttribute('aria-expanded', 'true');
    expect(field('Vitamin E (mg)')).toHaveValue(6.5);
    expect(field('Portion 1 label')).toHaveValue('1 tsp');

    await user.clear(field('Energy (kcal)'));
    await user.type(field('Energy (kcal)'), '520');
    await user.clear(field('Vitamin E (mg)'));
    await user.click(screen.getByRole('button', { name: 'Save food' }));

    const food = await savedFood();
    expect(food).toMatchObject({ name: 'Hazelnut spread' });
    expect(food.nutrients).toEqual({ energy_kcal: 520, fat: 31, sodium: 43 });
    expect(food.portions[0]).toMatchObject({ label: '1 tsp', grams: 5 });
  });

  it('saves the sodium of a changed salt', async () => {
    const id = await seedOwnFood();
    const { user } = renderEdit(id);

    await user.clear(await screen.findByLabelText('Salt (g)'));
    await user.type(field('Salt (g)'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Save food' }));

    expect((await savedFood()).nutrients).toMatchObject({ sodium: 500 });
  });

  it('archives the food once confirmed', async () => {
    const id = await seedOwnFood();
    const { user } = renderEdit(id);

    await user.click(
      await screen.findByRole('button', { name: 'Archive food' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Archive Hazelnut spread?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/foods'));
    expect(await ownFoods()).toEqual([{ id, archived_at: expect.any(String) }]);
  });

  it('does not edit a reference food', async () => {
    const id = await insertFood(
      api.database(),
      {
        source: 'off',
        source_id: '3017620422003',
        barcode: '3017620422003',
        name: 'Nutella',
        brand: 'Ferrero',
        quantity_label: '400 g',
        nutrients: { energy_kcal: 539 },
        portions: [],
      },
      seeding(),
    );
    renderEdit(id);

    expect(await screen.findByText(notEditable)).toBeVisible();
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
