import type { Kysely } from 'kysely';
import { insertDiaryEntry, logFood } from '@/lib/db/diary';
import { type FoodWriteContext, insertFood } from '@/lib/db/foods';
import { saveGoalSettings } from '@/lib/db/goals';
import { saveProfile } from '@/lib/db/profiles';
import type { Database } from '@/lib/db/schema';
import { defaultGoalSettings } from '@/lib/domain/goals/settings';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';

const seeding = (): FoodWriteContext => {
  let ids = 0;
  let minutes = 0;
  return {
    nextId: () => `seed-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 7, minutes++)).toISOString(),
  };
};

const logged = (outcome: Awaited<ReturnType<typeof logFood>>) => {
  if (outcome.outcome !== 'logged') {
    throw new Error(`Could not log the fixture: ${outcome.outcome}`);
  }
  return outcome.entry;
};

export const seedDiaryDay = async (db: Kysely<Database>, date: string) => {
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
        fibre: 10.1,
        sugars: 1.1,
        saturated_fat: 1.1,
        sodium: 6,
      },
      portions: [{ label: '1 cup', grams: 80 }],
    },
    context,
  );
  const nutella = await insertFood(
    db,
    {
      source: 'off',
      source_id: '3017620422003',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantity_label: '400 g',
      nutrients: {
        energy_kcal: 539,
        protein: 6.3,
        carbohydrate: 57.5,
        fat: 30.9,
        saturated_fat: 10.6,
        sugars: 56.3,
        sodium: 42,
      },
      portions: [{ label: '1 serving', grams: 15 }],
    },
    context,
  );
  const oatsEntry = logged(
    await logFood(
      db,
      'user-1',
      {
        date,
        meal: 'breakfast',
        time: '08:00',
        foodId: oats,
        portion: '1 cup',
        quantity: 1,
      },
      context,
    ),
  );
  const nutellaEntry = logged(
    await logFood(
      db,
      'user-1',
      {
        date,
        meal: 'breakfast',
        time: null,
        foodId: nutella,
        portion: '1 serving',
        quantity: 2,
      },
      context,
    ),
  );
  const pizzaEntry = await insertDiaryEntry(
    db,
    'user-1',
    {
      kind: 'quick',
      date,
      meal: 'dinner',
      time: '21:00',
      label: "Pizza at Luigi's",
      nutrients: { energy_kcal: 900, protein: 35, carbohydrate: 100, fat: 38 },
    },
    context,
  );
  return { nutellaEntry, oatsEntry, pizzaEntry };
};

export const seedManualGoal = async (
  db: Kysely<Database>,
  overrides: NutrientVector,
) => {
  const now = '2026-10-01T08:00:00.000Z';
  await saveProfile(
    db,
    'user-1',
    {
      sex: 'female',
      birthDate: '1990-06-15',
      heightCm: 168,
      activityLevel: 'moderate',
    },
    now,
  );
  await saveGoalSettings(
    db,
    'user-1',
    { ...defaultGoalSettings, mode: 'manual', overrides },
    now,
  );
};
