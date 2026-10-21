import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import type { EstimateMeal, MealEstimateResult } from '../ai/meal-estimator.ts';
import { insertFood } from '../db/foods.ts';
import type { MealDraft, MealEstimate } from '../domain/diary/meal-estimate.ts';
import { maxPhotoBytes } from '../photo-upload.ts';
import { maxMealEstimateBytes, mealEstimateRoute } from './route.ts';

const signedInHeader = 'x-test-user';

const database = migratedDatabasePerTest();

const clock = {
  now: () => '2026-10-20T12:00:00.000Z',
  nextId: () => 'oats',
};

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values(
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
  await insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'user-1',
      barcode: null,
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 370, protein: 13, carbohydrate: 60, fat: 7 },
      portions: [],
    },
    clock,
  );
});

const jpeg = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

const webp = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0]);
  bytes.set(new TextEncoder().encode('WEBPVP8 '), 8);
  return bytes;
};

const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const estimate: MealEstimate = {
  items: [
    {
      kind: 'food',
      name: 'Oats',
      grams: 50,
      confidence: 0.9,
      note: null,
      foodId: 'oats',
      portion: null,
    },
  ],
  notes: ['The milk could be oat milk'],
};

const estimates =
  (result: MealEstimateResult): EstimateMeal =>
  async () =>
    result;

const route = (
  estimateMeal: EstimateMeal | null = estimates({ estimated: true, estimate }),
) => {
  const logger = pino({ enabled: false });
  const warn = vi.spyOn(logger, 'warn');
  return {
    warn,
    handle: mealEstimateRoute({
      estimateMeal,
      db: database(),
      logger,
      resolveCaller: async (headers) => {
        const userId = headers.get(signedInHeader);
        return userId === null ? null : { userId };
      },
    }),
  };
};

type Fields = {
  photos?: Uint8Array[];
  description?: string;
  previous?: string;
};

const formOf = ({ photos = [jpeg()], description, previous }: Fields) => {
  const form = new FormData();
  for (const [index, photo] of photos.entries()) {
    form.append(
      'photos',
      new Blob([photo.slice()], { type: 'image/jpeg' }),
      `photo-${index}.jpg`,
    );
  }
  if (description !== undefined) {
    form.append('description', description);
  }
  if (previous !== undefined) {
    form.append('previous', previous);
  }
  return form;
};

const post = (fields: Fields = {}, userId: string | null = 'user-1') =>
  new Request('http://localhost/api/meal-estimate', {
    method: 'POST',
    body: formOf(fields),
    headers: userId === null ? {} : { [signedInHeader]: userId },
  });

const draft: MealDraft = {
  items: [
    {
      kind: 'food',
      name: 'Rolled oats',
      grams: 50,
      confidence: 0.9,
      unsure: false,
      note: null,
      nutrients: { energy_kcal: 185, protein: 6.5, carbohydrate: 30, fat: 3.5 },
      foodId: 'oats',
      portionLabel: '1 g',
      quantity: 50,
    },
  ],
  totals: { energy_kcal: 185, protein: 6.5, carbohydrate: 30, fat: 3.5 },
  notes: [],
};

describe('the meal estimate route', () => {
  it('answers 401 without a session, before estimating anything', async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    const response = await route(estimateMeal).handle(post({}, null));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it('answers 503 while the estimator is off', async () => {
    const response = await route(null).handle(post());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'MEAL_ESTIMATES_OFF' });
  });

  it("answers the estimate as a draft resolved against the caller's foods", async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));
    const photos = [jpeg(), webp()];

    const response = await route(estimateMeal).handle(
      post({ photos, description: '  Porridge  ' }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const answered = await response.json();
    expect(answered).toMatchObject({
      items: [
        {
          kind: 'food',
          name: 'Rolled oats',
          grams: 50,
          foodId: 'oats',
          portionLabel: '1 g',
          quantity: 50,
          unsure: false,
        },
      ],
      notes: ['The milk could be oat milk'],
    });
    expect(answered.totals.energy_kcal).toBeCloseTo(185);
    expect(answered.totals.protein).toBeCloseTo(6.5);
    expect(estimateMeal).toHaveBeenCalledWith({
      photos,
      description: 'Porridge',
      foods: expect.objectContaining({
        searchFoods: expect.any(Function),
        getFood: expect.any(Function),
        resolveMatches: expect.any(Function),
      }),
    });
  });

  it("leaves another user's food unresolved", async () => {
    const response = await route().handle(post({}, 'user-2'));

    expect(await response.json()).toMatchObject({
      items: [{ kind: 'guess', name: 'Oats', unresolved: true, nutrients: {} }],
      totals: {},
    });
  });

  it("gives the estimator the caller's foods", async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    await route(estimateMeal).handle(post());

    const { foods } = estimateMeal.mock.calls[0]?.[0] ?? {};
    expect(await foods?.getFood('oats')).toMatchObject({ name: 'Rolled oats' });
  });

  it('sends a previous round to the estimator', async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    const response = await route(estimateMeal).handle(
      post({
        previous: JSON.stringify({ draft, feedback: 'It was 80 g of oats' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(estimateMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        previous: { draft, feedback: 'It was 80 g of oats' },
      }),
    );
  });

  it.each([
    ['no photos', { photos: [] }],
    ['five photos', { photos: [jpeg(), jpeg(), jpeg(), jpeg(), jpeg()] }],
    ['a description over 500 characters', { description: 'a'.repeat(501) }],
    ['a previous round that is not JSON', { previous: '{draft' }],
    [
      'a previous round without feedback',
      { previous: JSON.stringify({ draft, feedback: ' ' }) },
    ],
    [
      'a previous round with a malformed draft',
      { previous: JSON.stringify({ draft: { items: 1 }, feedback: 'More' }) },
    ],
  ])('answers 400 for %s, without estimating', async (_, fields) => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    const response = await route(estimateMeal).handle(post(fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_REQUEST' });
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not a form', async () => {
    const response = await route().handle(
      new Request('http://localhost/api/meal-estimate', {
        method: 'POST',
        body: jpeg(),
        headers: { [signedInHeader]: 'user-1', 'content-type': 'image/jpeg' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('answers 400 for photos sent as text', async () => {
    const form = new FormData();
    form.append('photos', 'not a photo');

    const response = await route().handle(
      new Request('http://localhost/api/meal-estimate', {
        method: 'POST',
        body: form,
        headers: { [signedInHeader]: 'user-1' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('answers 413 for a photo over 8 MB, without estimating', async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    const response = await route(estimateMeal).handle(
      post({ photos: [jpeg(), jpeg(maxPhotoBytes + 1)] }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'PHOTO_TOO_LARGE' });
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it('answers 413 for a body declared over the limit, before reading it', async () => {
    const request = post();
    request.headers.set('content-length', String(maxMealEstimateBytes + 1));

    const response = await route().handle(request);

    expect(response.status).toBe(413);
  });

  it('answers 415 for a PNG among the photos, without estimating', async () => {
    const estimateMeal = vi.fn(estimates({ estimated: true, estimate }));

    const response = await route(estimateMeal).handle(
      post({ photos: [jpeg(), png()] }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'UNSUPPORTED_PHOTO' });
    expect(estimateMeal).not.toHaveBeenCalled();
  });

  it.each([
    ['unreadable', 422],
    ['rejected', 422],
    ['rate-limited', 429],
    ['unavailable', 503],
  ] as const)(
    'answers %s with %i, logged without the photos',
    async (failure, status) => {
      const { handle, warn } = route(
        estimates({ estimated: false, failure, message: 'It failed' }),
      );

      const response = await handle(post());

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: failure });
      expect(warn).toHaveBeenCalledWith(
        { userId: 'user-1', failure, error: 'It failed' },
        'A meal could not be estimated',
      );
    },
  );
});
