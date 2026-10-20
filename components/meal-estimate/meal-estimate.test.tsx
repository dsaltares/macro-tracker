import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiaryDay } from '@/components/diary/diary-day';
import { FoodSearchSheet } from '@/components/diary/food-search-sheet';
import { emptyRecipe } from '@/components/diary/recipe-step';
import { shrinkPhoto } from '@/components/label-scan/photo';
import {
  logMealFailed,
  unresolvedNote,
} from '@/components/meal-estimate/meal-draft-review';
import {
  estimateErrorMessages,
  mealCapturePrompt,
} from '@/components/meal-estimate/meal-photo-step';
import { Toaster } from '@/components/ui/sonner';
import { diaryDay } from '@/lib/db/diary';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { createRecipe } from '@/lib/db/recipes';
import {
  type MatchedFood,
  type MealDraft,
  mealDraft,
  mealEstimateSchema,
} from '@/lib/domain/diary/meal-estimate';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

vi.mock('@/components/label-scan/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/label-scan/photo')>()),
  shrinkPhoto: vi.fn(),
}));

const api = serveApi({ signedInAs: 'user-1' });

const day = '2026-10-19';

const shrunk = new Blob([new Uint8Array(300_000)], { type: 'image/webp' });

const photo = (name: string) =>
  new File([new Uint8Array(4_000_000)], name, { type: 'image/jpeg' });

const seeding = (): FoodWriteContext => {
  let ids = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7)).toISOString(),
  };
};

const eggs: MatchedFood = {
  name: 'Boiled eggs',
  nutrients: { energy_kcal: 143, protein: 12.6, carbohydrate: 0.7, fat: 9.5 },
  portions: [{ label: '1 egg', grams: 50 }],
};

const sourdough: MatchedFood = {
  name: 'Sourdough bread',
  nutrients: { energy_kcal: 250, protein: 9, carbohydrate: 50, fat: 1.5 },
  portions: [],
};

const seedFoods = async () => {
  const db = api.database();
  const context = seeding();
  const food = (
    source: 'ciqual' | 'off',
    sourceId: string,
    matched: MatchedFood,
  ) =>
    insertFood(
      db,
      {
        source,
        source_id: sourceId,
        barcode: null,
        name: matched.name,
        brand: null,
        quantity_label: null,
        nutrients: matched.nutrients,
        portions: [...matched.portions],
      },
      context,
    );
  const eggsId = await food('ciqual', '22000', eggs);
  const sourdoughId = await food('off', '0000000000017', sourdough);
  const butterId = await food('ciqual', '16400', {
    name: 'Butter, salted',
    nutrients: { energy_kcal: 740, protein: 0.7, carbohydrate: 0.6, fat: 82 },
    portions: [],
  });
  return { eggsId, sourdoughId, butterId };
};

const latte = {
  kind: 'guess',
  name: 'Latte',
  grams: 250,
  confidence: 0.6,
  note: 'The cup may hold more',
  nutrients: { energy_kcal: 130, protein: 8, carbohydrate: 12, fat: 5 },
};

const seedDraft = async (extra: unknown[] = []): Promise<MealDraft> => {
  const { eggsId, sourdoughId } = await seedFoods();
  return mealDraft(
    mealEstimateSchema.parse({
      items: [
        {
          kind: 'food',
          name: 'Eggs',
          grams: 100,
          confidence: 0.9,
          note: null,
          foodId: eggsId,
          portion: { label: '1 egg', quantity: 2 },
        },
        {
          kind: 'food',
          name: 'Toast',
          grams: 80,
          confidence: 0.85,
          note: null,
          foodId: sourdoughId,
          portion: null,
        },
        latte,
        ...extra,
      ],
      notes: ['A knob of butter may be hidden'],
    }),
    {
      foods: new Map([
        [eggsId, eggs],
        [sourdoughId, sourdough],
      ]),
      recipes: new Map(),
    },
  );
};

const answering = (...responses: Response[]) => {
  const posted: FormData[] = [];
  api.use(
    http.post('*/api/meal-estimate', async ({ request }) => {
      posted.push(await request.formData());
      return responses.shift() ?? HttpResponse.json({}, { status: 500 });
    }),
  );
  return posted;
};

const renderSheet = (mealEstimates = true, onClose = () => {}) =>
  renderUi(
    <FoodSearchSheet
      date={day}
      meal="lunch"
      mealEstimates={mealEstimates}
      onClose={onClose}
    />,
    { wrap: api.wrap },
  );

type User = ReturnType<typeof renderSheet>['user'];

const choosePhotosAndDescribe = async (user: User) => {
  await user.click(
    await screen.findByRole('button', { name: 'Estimate from a photo' }),
  );
  await user.upload(screen.getByLabelText('Choose photos'), [
    photo('IMG_0001.jpg'),
    photo('IMG_0002.jpg'),
  ]);
  await user.type(
    screen.getByLabelText('Description'),
    'two eggs, sourdough, latte',
  );
};

const estimate = async (user: User) => {
  await choosePhotosAndDescribe(user);
  await user.click(screen.getByRole('button', { name: 'Estimate' }));
  return screen.findByRole('region', { name: 'Review the meal' });
};

const totalOf = (label: string) => {
  const totals = screen.getByRole('region', { name: 'Meal totals' });
  const terms = within(totals).getAllByRole('term');
  const index = terms.findIndex((term) => term.textContent === label);
  return within(totals).getAllByRole('definition')[index]?.textContent;
};

const kcal = (amount: number) => formatAmount(amount, 'kcal');

const row = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

const lunch = async () =>
  (await diaryDay(api.database(), 'user-1', day))
    .filter(({ meal }) => meal === 'lunch')
    .map(({ label, grams, nutrients }) => ({
      label,
      grams,
      energy: nutrients.energy_kcal,
    }));

beforeEach(() => {
  vi.mocked(shrinkPhoto).mockResolvedValue(shrunk);
});

describe('MealPhotoStep', () => {
  it('offers no meal estimate while estimation is off', async () => {
    renderSheet(false);

    expect(
      await screen.findByRole('button', { name: 'Scan a barcode' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Estimate from a photo' }),
    ).not.toBeInTheDocument();
  });

  it('takes a photo with the rear camera or chooses several', async () => {
    const { user } = renderSheet();

    await user.click(
      await screen.findByRole('button', { name: 'Estimate from a photo' }),
    );

    expect(screen.getByText(mealCapturePrompt)).toBeInTheDocument();
    expect(screen.getByLabelText('Take a photo')).toHaveAttribute(
      'capture',
      'environment',
    );
    expect(screen.getByLabelText('Choose photos')).toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeDisabled();
  });

  it('shrinks each photo, shows it and removes it', async () => {
    const { user } = renderSheet();

    await choosePhotosAndDescribe(user);

    expect(shrinkPhoto).toHaveBeenCalledTimes(2);
    const thumbnails = screen.getByRole('list', { name: 'Photos' });
    expect(within(thumbnails).getAllByRole('img')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    expect(within(thumbnails).getAllByRole('img')).toHaveLength(1);
  });

  it('keeps four photos at most and then offers no more', async () => {
    const { user } = renderSheet();

    await user.click(
      await screen.findByRole('button', { name: 'Estimate from a photo' }),
    );
    await user.upload(
      screen.getByLabelText('Choose photos'),
      ['1', '2', '3', '4', '5'].map((index) => photo(`IMG_000${index}.jpg`)),
    );

    expect(
      within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('img'),
    ).toHaveLength(4);
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Take a photo')).not.toBeInTheDocument();
  });

  it('sends the shrunk photos and the description', async () => {
    const posted = answering(HttpResponse.json(await seedDraft()));
    const { user } = renderSheet();

    await estimate(user);

    expect(posted).toHaveLength(1);
    const [form] = posted;
    expect(form?.getAll('photos')).toHaveLength(2);
    expect(form?.getAll('photos').map((sent) => (sent as File).type)).toEqual([
      'image/webp',
      'image/webp',
    ]);
    expect(form?.get('description')).toBe('two eggs, sourdough, latte');
  });

  it('shows a failure and tries again with the same photos', async () => {
    const posted = answering(
      HttpResponse.json({ error: 'unavailable' }, { status: 503 }),
      HttpResponse.json(await seedDraft()),
    );
    const { user } = renderSheet();

    await choosePhotosAndDescribe(user);
    await user.click(screen.getByRole('button', { name: 'Estimate' }));

    expect(
      await screen.findByText(estimateErrorMessages.unavailable),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('img'),
    ).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('region', { name: 'Review the meal' }),
    ).toBeInTheDocument();
    expect(posted.map((form) => form.getAll('photos').length)).toEqual([2, 2]);
  });

  it('offers no retry when the photos were refused', async () => {
    answering(HttpResponse.json({ error: 'rejected' }, { status: 422 }));
    const { user } = renderSheet();

    await choosePhotosAndDescribe(user);
    await user.click(screen.getByRole('button', { name: 'Estimate' }));

    expect(
      await screen.findByText(estimateErrorMessages.rejected),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estimate' })).toBeEnabled();
  });
});

describe('MealDraftReview', () => {
  it("shows the draft's items and totals, flagging the unsure ones", async () => {
    answering(HttpResponse.json(await seedDraft()));
    const { user } = renderSheet();

    const review = await estimate(user);

    expect(totalOf('Energy')).toBe(kcal(143 + 200 + 130));
    const items = within(review).getByRole('list', { name: 'Items' });
    expect(
      await within(items).findByText('Open Food Facts'),
    ).toBeInTheDocument();
    expect(
      within(items)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^Boiled eggsCIQUAL100 g · 143 kcal/),
      expect.stringMatching(/^Sourdough breadOpen Food Facts80 g · 200 kcal/),
      expect.stringMatching(
        /^LatteEstimateCheck250 g · 130 kcal.*The cup may hold more$/,
      ),
    ]);
    expect(
      within(review).getByText('A knob of butter may be hidden'),
    ).toBeInTheDocument();
  });

  it('updates the totals when an amount is edited', async () => {
    answering(HttpResponse.json(await seedDraft()));
    const { user } = renderSheet();
    await estimate(user);

    await user.click(row('Sourdough bread'));
    const editor = screen.getByRole('region', { name: 'Sourdough bread' });
    const quantity = await within(editor).findByLabelText('Quantity');
    expect(quantity).toHaveValue(80);
    await user.clear(quantity);
    await user.type(quantity, '160');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));

    expect(row('Sourdough bread')).toHaveTextContent('160 g · 400 kcal');
    expect(totalOf('Energy')).toBe(kcal(143 + 400 + 130));
  });

  it("edits a guess's amounts and stops flagging it", async () => {
    answering(HttpResponse.json(await seedDraft()));
    const { user } = renderSheet();
    await estimate(user);

    await user.click(row('Latte'));
    const editor = screen.getByRole('region', { name: 'Latte' });
    await user.clear(within(editor).getByLabelText('Energy (kcal)'));
    await user.type(within(editor).getByLabelText('Energy (kcal)'), '190');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));

    expect(row('Latte')).toHaveTextContent('250 g · 190 kcal');
    expect(row('Latte')).not.toHaveTextContent('Check');
    expect(totalOf('Energy')).toBe(kcal(143 + 200 + 190));
  });

  it('removes a row from the totals and from what is logged', async () => {
    answering(HttpResponse.json(await seedDraft()));
    const onClose = vi.fn();
    const { user } = renderSheet(true, onClose);
    await estimate(user);

    await user.click(screen.getByRole('button', { name: 'Remove Latte' }));

    expect(screen.queryByRole('button', { name: /^Latte/ })).toBeNull();
    expect(totalOf('Energy')).toBe(kcal(143 + 200));

    await user.click(screen.getByRole('button', { name: 'Log meal' }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await lunch()).toEqual([
      { label: 'Boiled eggs', grams: 100, energy: 143 },
      { label: 'Sourdough bread', grams: 80, energy: 200 },
    ]);
  });

  it('adds an item from the search', async () => {
    answering(HttpResponse.json(await seedDraft()));
    const { user } = renderSheet();
    await estimate(user);

    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.type(screen.getByLabelText('Search foods'), 'butter');
    await user.click(
      await screen.findByRole('button', { name: /Butter, salted/ }),
    );
    const editor = screen.getByRole('region', { name: 'Butter, salted' });
    await user.selectOptions(
      await within(editor).findByLabelText('Portion'),
      '1 g',
    );
    await user.clear(within(editor).getByLabelText('Quantity'));
    await user.type(within(editor).getByLabelText('Quantity'), '10');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));

    expect(row('Butter, salted')).toHaveTextContent('10 g · 74 kcal');
    expect(totalOf('Energy')).toBe(kcal(143 + 200 + 130 + 74));
  });

  it('replaces an unresolved row with a food, keeping the grams', async () => {
    answering(
      HttpResponse.json(
        await seedDraft([
          {
            kind: 'food',
            name: 'Butter',
            grams: 10,
            confidence: 0.7,
            note: null,
            foodId: 'gone',
            portion: null,
          },
        ]),
      ),
    );
    const { user } = renderSheet();
    await estimate(user);

    expect(row('Butter')).toHaveTextContent('Check');
    expect(screen.getByText(unresolvedNote)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Replace Butter' }));

    expect(screen.getByLabelText('Search foods')).toHaveValue('Butter');
    await user.click(
      await screen.findByRole('button', { name: /Butter, salted/ }),
    );

    expect(
      await screen.findByRole('region', { name: 'Review the meal' }),
    ).toBeInTheDocument();
    expect(row('Butter, salted')).toHaveTextContent('10 g · 74 kcal');
    expect(screen.queryByText(unresolvedNote)).toBeNull();
    expect(totalOf('Energy')).toBe(kcal(143 + 200 + 130 + 74));
  });

  it('refuses to replace a row with a recipe without ingredients', async () => {
    answering(HttpResponse.json(await seedDraft()));
    await createRecipe(
      api.database(),
      'user-1',
      { name: 'Iced latte', servings: 1, cookedWeightG: null, notes: null },
      seeding(),
    );
    const { user } = renderSheet();
    await estimate(user);

    await user.click(screen.getByRole('button', { name: 'Replace Latte' }));
    await user.click(screen.getByRole('tab', { name: 'Recipes' }));
    await user.click(await screen.findByRole('button', { name: /Iced latte/ }));

    expect(await screen.findByText(emptyRecipe)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to the meal' }));
    expect(row('Latte')).toHaveTextContent('250 g · 130 kcal');
  });

  it('keeps the draft when logging it fails', async () => {
    answering(HttpResponse.json(await seedDraft()));
    api.fails('diary.addMeal');
    const { user } = renderSheet();
    await estimate(user);

    await user.click(screen.getByRole('button', { name: 'Log meal' }));

    expect(await screen.findByText(logMealFailed)).toBeInTheDocument();
    expect(row('Latte')).toBeInTheDocument();
  });

  it('logs the meal and the day view shows it', async () => {
    const posted = answering(HttpResponse.json(await seedDraft()));
    const { user } = renderUi(<DiaryDay mealEstimates />, {
      wrap: (children) =>
        api.wrap(
          <NuqsTestingAdapter searchParams={`?date=${day}`} hasMemory>
            {children}
            <Toaster />
          </NuqsTestingAdapter>,
        ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add to lunch' }),
    );
    await estimate(user);
    await user.click(screen.getByRole('button', { name: 'Log meal' }));

    expect(
      await screen.findByText('Logged 3 entries to lunch'),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: 'Add to lunch' }),
    ).not.toBeInTheDocument();
    const lunchSection = screen.getByRole('region', { name: 'Lunch' });
    for (const label of ['Boiled eggs', 'Sourdough bread', 'Latte']) {
      expect(
        await within(lunchSection).findByRole('button', {
          name: new RegExp(label),
        }),
      ).toBeInTheDocument();
    }
    expect(await lunch()).toEqual([
      { label: 'Boiled eggs', grams: 100, energy: 143 },
      { label: 'Sourdough bread', grams: 80, energy: 200 },
      { label: 'Latte', grams: null, energy: 130 },
    ]);
  });
});
