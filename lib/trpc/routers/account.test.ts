import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { addFavourite, insertDiaryEntry } from '../../db/diary.ts';
import { insertFood } from '../../db/foods.ts';
import type { Profile } from '../../domain/profile.ts';
import { createCaller } from '../root.ts';
import {
  lastSignInMethod,
  passwordAlreadySet,
  wrongConfirmation,
} from './account.ts';

const database = migratedDatabasePerTest();

const users = ['user-1', 'user-2'];

const now = () => '2026-10-20T12:00:00.000Z';

let ids = 0;

const nextId = () => `id-${++ids}`;

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    now,
    nextId,
  });

const profile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const nutrients = { energy_kcal: 530, protein: 6, carbohydrate: 58, fat: 31 };

let referenceFoodId = '';

const giveEverything = async (userId: string) => {
  const db = database();
  await db
    .insertInto('sessions')
    .values({
      id: `${userId}-session`,
      user_id: userId,
      token: `${userId}-token`,
      expires_at: '2027-10-20T12:00:00.000Z',
    })
    .execute();
  await db
    .insertInto('accounts')
    .values({
      id: `${userId}-account`,
      user_id: userId,
      account_id: userId,
      provider_id: 'credential',
      password: 'hashed',
    })
    .execute();
  const caller = as(userId);
  await caller.profile.upsert(profile);
  await caller.food.setSourcePreferences([
    { source: 'usda', enabled: true },
    { source: 'ciqual', enabled: false },
    { source: 'cofid', enabled: true },
  ]);
  const ownFoodId = await insertFood(
    db,
    {
      source: 'user',
      owner_user_id: userId,
      barcode: null,
      name: `${userId}'s granola`,
      brand: null,
      quantity_label: null,
      nutrients,
      portions: [{ label: '1 bowl', grams: 60 }],
    },
    { now, nextId },
  );
  await insertDiaryEntry(
    db,
    userId,
    {
      kind: 'food',
      foodId: referenceFoodId,
      date: '2026-10-20',
      meal: 'breakfast',
      time: '08:00',
      label: 'Nutella',
      quantity: 1,
      portionLabel: '100 g',
      grams: 100,
      nutrients,
    },
    { now, nextId },
  );
  await addFavourite(db, userId, referenceFoodId, now);
  await caller.body.log({
    date: '2026-10-20',
    metric: 'weight_kg',
    value: 72.4,
  });
  await caller.goals.set({
    mode: 'derived',
    weeklyRateKg: -0.5,
    proteinGPerKg: 1.8,
    fatEnergyShare: 0.3,
    overrides: { iron: 18 },
  });
  await caller.food.addPortion({
    foodId: referenceFoodId,
    label: `${userId}'s spoon`,
    grams: 15,
  });
  await giveRecipes(db, userId, ownFoodId);
  await caller.apiKeys.create({ name: `${userId}'s script`, scopes: ['read'] });
};

const giveRecipes = async (
  db: ReturnType<typeof database>,
  userId: string,
  ownFoodId: string,
) => {
  const recipe = (id: string, name: string) => ({
    id,
    user_id: userId,
    name,
    servings: 2,
    cooked_weight_g: null,
    notes: null,
    archived_at: null,
    created_at: now(),
    updated_at: now(),
  });
  const ingredient = (
    id: string,
    recipeId: string,
    link: { food_id: string } | { child_recipe_id: string },
    position: number,
  ) => ({
    id,
    recipe_id: recipeId,
    food_id: null,
    child_recipe_id: null,
    ...link,
    grams: 60,
    portion_label: '1 bowl',
    quantity: 1,
    position,
  });
  const base = `${userId}-granola-bowl`;
  const breakfast = `${userId}-breakfast`;
  await db
    .insertInto('recipes')
    .values([recipe(base, 'Granola bowl'), recipe(breakfast, 'Breakfast')])
    .execute();
  await db
    .insertInto('recipe_ingredients')
    .values([
      ingredient(`${base}-granola`, base, { food_id: ownFoodId }, 0),
      ingredient(`${base}-nutella`, base, { food_id: referenceFoodId }, 1),
      ingredient(`${breakfast}-bowl`, breakfast, { child_recipe_id: base }, 0),
    ])
    .execute();
};

const ownedRows = (userId: string) => {
  const ownFoods = sql`select id from foods where owner_user_id = ${userId}`;
  const ownRecipes = sql`select id from recipes where user_id = ${userId}`;
  return {
    users: sql`id = ${userId}`,
    sessions: sql`user_id = ${userId}`,
    accounts: sql`user_id = ${userId}`,
    profiles: sql`user_id = ${userId}`,
    food_source_preferences: sql`user_id = ${userId}`,
    foods: sql`owner_user_id = ${userId}`,
    food_nutrients: sql`food_id in (${ownFoods})`,
    food_portions: sql`user_id = ${userId} or food_id in (${ownFoods})`,
    diary_entries: sql`user_id = ${userId}`,
    favourites: sql`user_id = ${userId}`,
    body_measurements: sql`user_id = ${userId}`,
    goals: sql`user_id = ${userId}`,
    recipes: sql`user_id = ${userId}`,
    recipe_ingredients: sql`recipe_id in (${ownRecipes})`,
    api_keys: sql`user_id = ${userId}`,
  };
};

const rowsOf = async (userId: string) =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(ownedRows(userId)).map(async ([table, where]) => {
        const { rows } = await sql<{ rows: number }>`
          select count(*) as rows from ${sql.table(table)} where ${where}
        `.execute(database());
        return [table, Number(rows[0]?.rows)] as const;
      }),
    ),
  );

const nothing = Object.fromEntries(
  Object.keys(ownedRows('nobody')).map((table) => [table, 0]),
);

beforeEach(async () => {
  ids = 0;
  await database()
    .insertInto('users')
    .values(
      users.map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        email_verified: 1,
      })),
    )
    .execute();
  referenceFoodId = await insertFood(
    database(),
    {
      source: 'off',
      source_id: '3017620422003',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantity_label: null,
      nutrients,
      portions: [],
    },
    { now, nextId },
  );
  for (const userId of users) {
    await giveEverything(userId);
  }
});

describe('account.delete', () => {
  it("deletes the caller's account and everything it owns, and nobody else's", async () => {
    const before = await rowsOf('user-2');
    expect(Object.values(before).every((rows) => rows > 0)).toBe(true);

    await as('user-1').account.delete({ email: 'user-1@example.test' });

    expect(await rowsOf('user-1')).toEqual(nothing);
    expect(await rowsOf('user-2')).toEqual(before);
    expect(
      await database()
        .selectFrom('foods')
        .select('name')
        .where('id', '=', referenceFoodId)
        .executeTakeFirst(),
    ).toEqual({ name: 'Nutella' });
  });

  it('takes the address in any case and with spaces around it', async () => {
    await as('user-1').account.delete({ email: '  User-1@Example.TEST ' });

    expect((await rowsOf('user-1')).users).toBe(0);
  });

  it('refuses any address but the account’s own, and deletes nothing', async () => {
    const before = await rowsOf('user-1');

    await expect(
      as('user-1').account.delete({ email: 'user-2@example.test' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: wrongConfirmation,
    });
    expect(await rowsOf('user-1')).toEqual(before);
    expect((await rowsOf('user-2')).users).toBe(1);
  });

  it('needs an account', async () => {
    await expect(
      as(null).account.delete({ email: 'user-1@example.test' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

const providersOf = async (userId: string) =>
  (
    await database()
      .selectFrom('accounts')
      .select('provider_id')
      .where('user_id', '=', userId)
      .orderBy('provider_id')
      .execute()
  ).map(({ provider_id }) => provider_id);

const connectGoogle = (userId: string) =>
  database()
    .insertInto('accounts')
    .values({
      id: `${userId}-google`,
      user_id: userId,
      account_id: `${userId}-google-subject`,
      provider_id: 'google',
    })
    .execute();

const dropPassword = (userId: string) =>
  database()
    .deleteFrom('accounts')
    .where('user_id', '=', userId)
    .where('provider_id', '=', 'credential')
    .execute();

const newPassword = {
  password: 'lentils-and-rice-forever',
  confirmPassword: 'lentils-and-rice-forever',
};

describe('account.signInMethods', () => {
  it("lists the caller's methods, and nobody else's", async () => {
    await connectGoogle('user-2');

    expect(await as('user-1').account.signInMethods()).toEqual({
      password: true,
      google: false,
    });
    expect(await as('user-2').account.signInMethods()).toEqual({
      password: true,
      google: true,
    });
  });

  it('needs an account', async () => {
    await expect(as(null).account.signInMethods()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('account.setPassword', () => {
  it('adds a password to an account with only Google', async () => {
    await connectGoogle('user-1');
    await dropPassword('user-1');

    await as('user-1').account.setPassword(newPassword);

    expect(await providersOf('user-1')).toEqual(['credential', 'google']);
    expect(
      await database()
        .selectFrom('accounts')
        .select(['account_id', 'password'])
        .where('user_id', '=', 'user-1')
        .where('provider_id', '=', 'credential')
        .executeTakeFirstOrThrow(),
    ).toEqual({ account_id: 'user-1', password: expect.stringMatching(/:/) });
  });

  it('refuses an account that has a password already, and keeps it', async () => {
    await expect(
      as('user-1').account.setPassword(newPassword),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: passwordAlreadySet,
    });
    expect(
      await database()
        .selectFrom('accounts')
        .select('password')
        .where('user_id', '=', 'user-1')
        .execute(),
    ).toEqual([{ password: 'hashed' }]);
  });

  it('holds the password to the sign-up rules', async () => {
    await dropPassword('user-1');
    await connectGoogle('user-1');

    await expect(
      as('user-1').account.setPassword({
        password: 'short',
        confirmPassword: 'short',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await providersOf('user-1')).toEqual(['google']);
  });

  it('needs an account', async () => {
    await expect(
      as(null).account.setPassword(newPassword),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('account.disconnect', () => {
  it("disconnects one of the caller's methods, and nobody else's", async () => {
    await connectGoogle('user-1');
    await connectGoogle('user-2');

    await as('user-1').account.disconnect({ method: 'password' });

    expect(await providersOf('user-1')).toEqual(['google']);
    expect(await providersOf('user-2')).toEqual(['credential', 'google']);
  });

  it('refuses to disconnect the last method', async () => {
    await expect(
      as('user-1').account.disconnect({ method: 'password' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: lastSignInMethod,
    });
    expect(await providersOf('user-1')).toEqual(['credential']);
  });

  it('does nothing to a method that is not connected', async () => {
    await as('user-1').account.disconnect({ method: 'google' });

    expect(await providersOf('user-1')).toEqual(['credential']);
  });

  it('needs an account', async () => {
    await expect(
      as(null).account.disconnect({ method: 'google' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
