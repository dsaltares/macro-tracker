import { nextTurn } from '../../data/import-foods.ts';
import { weightKgSchema } from '../../domain/body/measurements.ts';
import { addDays, daysBetween } from '../../domain/dates.ts';
import { type Meal, maxEntryLabelLength } from '../../domain/diary/entries.ts';
import {
  oneGram,
  type Portion,
  withStandardPortions,
} from '../../domain/foods/portions.ts';
import type { UserFoodFields } from '../../domain/foods/user-food.ts';
import type {
  HistoryImportProgress,
  HistoryImportSummary,
} from '../../domain/imports/history-import.ts';
import {
  forGrams,
  type NutrientVector,
  per100gFrom,
  sum,
  withEnergy,
} from '../../domain/nutrition/vector.ts';
import { maxMealItems } from '../../services/meal.ts';
import type { Account, AccountFood } from './account.ts';
import type { Cronometer, DateRange } from './client.ts';
import {
  type CronometerFood,
  type CronometerServing,
  cronometerNutrients,
  type DiaryEntry,
  foodNutrientsPer100g,
  isQuickAdd,
  mealOf,
  productNameOf,
  referenceIdOf,
  servingGrams,
  servingOf,
  timeOf,
  userFoodOf,
} from './cronometer.ts';
import {
  closestAgreeing,
  macrosAgree,
  ownCopyAmong,
  searchQueriesFor,
  vectorOf,
} from './match.ts';

export type FoodResolution =
  | { kind: 'source id' | 'name' | 'own copy'; food: AccountFood }
  | { kind: 'new'; fields: UserFoodFields }
  | { kind: 'quick'; reason: string };

export type ResolvedFood = {
  cronometer: CronometerFood;
  resolution: FoodResolution;
};

export type FoodRef =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; cronometerId: number };

export type PlannedItem =
  | {
      kind: 'food';
      food: FoodRef;
      portion: string;
      quantity: number;
      nutrients: NutrientVector;
    }
  | { kind: 'quick'; label: string; nutrients: NutrientVector };

export type PlannedMeal = {
  date: string;
  meal: Meal;
  time: string | null;
  items: PlannedItem[];
};

export type PlannedDay = {
  date: string;
  cronometer: NutrientVector;
  planned: NutrientVector;
};

export type ImportPlan = {
  range: DateRange;
  foods: ResolvedFood[];
  meals: PlannedMeal[];
  days: PlannedDay[];
  skippedDays: string[];
  skippedServings: { serving: CronometerServing; reason: string }[];
  weights: { date: string; kilograms: number }[];
  skippedWeights: { date: string; reason: string }[];
  fallbacks: number;
};

const resolveFood = async (
  account: Account,
  cronometer: CronometerFood,
): Promise<FoodResolution> => {
  if (isQuickAdd(cronometer)) {
    return { kind: 'quick', reason: 'a Cronometer quick add' };
  }
  const nutrients = foodNutrientsPer100g(cronometer);
  if (nutrients === null) {
    return {
      kind: 'quick',
      reason: 'a recipe whose weight Cronometer does not give',
    };
  }
  const reference = referenceIdOf(cronometer.source);
  if (reference !== null) {
    const food = await account.foodBySourceId(
      reference.source,
      reference.sourceId,
    );
    if (food !== null && macrosAgree(nutrients, vectorOf(food.nutrients))) {
      return { kind: 'source id', food };
    }
  }
  const target = { name: cronometer.name, nutrients };
  const words = productNameOf(cronometer);
  for (const query of searchQueriesFor([cronometer.name, words])) {
    const candidates = await account.searchFoods(query);
    const own = ownCopyAmong(target, candidates);
    if (own !== null) {
      return { kind: 'own copy', food: await account.food(own.id) };
    }
    const closest = closestAgreeing({ words, nutrients }, candidates);
    if (closest !== null) {
      return { kind: 'name', food: await account.food(closest.id) };
    }
  }
  const fields = userFoodOf(cronometer);
  return fields === null
    ? {
        kind: 'quick',
        reason: 'its amounts are not a valid food of your own',
      }
    : { kind: 'new', fields };
};

const quickLabel = (name: string) => name.trim().slice(0, maxEntryLabelLength);

const portionFor = (portions: readonly Portion[], measure: string | null) =>
  portions.find(
    (portion) => portion.label === measure?.trim() && portion.grams > 0,
  ) ?? oneGram;

type ServingOutcome =
  | { planned: PlannedItem; fallback: boolean }
  | { skipped: string };

const planServing = (
  serving: CronometerServing,
  resolved: ResolvedFood | undefined,
): ServingOutcome => {
  const snapshot = withEnergy(cronometerNutrients(serving.nutrients));
  const label = quickLabel(resolved?.cronometer.name ?? 'Cronometer entry');
  const quick = (fallback: boolean): ServingOutcome =>
    Object.keys(snapshot).length === 0
      ? { skipped: 'Cronometer has no nutrients for it' }
      : { planned: { kind: 'quick', label, nutrients: snapshot }, fallback };
  if (resolved === undefined || resolved.resolution.kind === 'quick') {
    return quick(false);
  }
  const grams = servingGrams(serving, resolved.cronometer);
  if (grams === null || grams <= 0) {
    return quick(true);
  }
  const { resolution } = resolved;
  const [food, nutrients, portions]: [FoodRef, NutrientVector, Portion[]] =
    resolution.kind === 'new'
      ? [
          { kind: 'new', cronometerId: resolved.cronometer.id },
          resolution.fields.nutrients,
          resolution.fields.portions,
        ]
      : [
          { kind: 'existing', id: resolution.food.id },
          vectorOf(resolution.food.nutrients),
          resolution.food.portions,
        ];
  if (!macrosAgree(per100gFrom(snapshot, grams), nutrients)) {
    return quick(true);
  }
  const portion = portionFor(
    withStandardPortions(portions),
    serving.measureName,
  );
  return {
    planned: {
      kind: 'food',
      food,
      portion: portion.label,
      quantity: grams / portion.grams,
      nutrients: forGrams(withEnergy(nutrients), grams),
    },
    fallback: false,
  };
};

const mealKey = (serving: CronometerServing) =>
  [serving.day, mealOf(serving.mealGroup), timeOf(serving.time)].join('|');

type OnProgress = (progress: HistoryImportProgress) => Promise<void> | void;

const ignoreProgress: OnProgress = () => {};

export const cronometerLaunched = '2011-01-01';

const daysPerRound = 4;

type DiaryDay = { date: string; entries: DiaryEntry[] };

const walkDiary = async (
  cronometer: Cronometer,
  account: Account,
  { from, to }: DateRange,
  onProgress: OnProgress,
) => {
  const logged = await account.loggedDates({ from, to });
  const total = daysBetween(from, to) + 1;
  const days: DiaryDay[] = [];
  let firstDate: string | null = null;
  let read = 0;
  for (let date = to; date >= from; date = addDays(date, -daysPerRound)) {
    const round = Array.from({ length: daysPerRound }, (_, index) =>
      addDays(date, -index),
    ).filter((day) => day >= from);
    const fetched = await Promise.all(
      round.map(async (day) => ({
        day,
        entries: logged.has(day) ? [] : await cronometer.diary(day),
      })),
    );
    for (const { day, entries } of fetched) {
      if (entries.length > 0) {
        days.push({ date: day, entries });
      }
      if (entries.length > 0 || logged.has(day)) {
        firstDate = day;
      }
    }
    read += round.length;
    await onProgress({ phase: 'reading', done: read, total });
  }
  return { days, logged: [...logged].toSorted(), firstDate: firstDate ?? to };
};

export const planImport = async ({
  cronometer,
  account,
  to,
  from = cronometerLaunched,
  onProgress = ignoreProgress,
}: {
  cronometer: Cronometer;
  account: Account;
  to: string;
  from?: string;
  onProgress?: OnProgress;
}): Promise<ImportPlan> => {
  await onProgress({ phase: 'reading', done: 0, total: 0 });
  const walk = await walkDiary(cronometer, account, { from, to }, onProgress);
  const foodIds = [
    ...new Set(
      walk.days.flatMap(({ entries }) =>
        entries.flatMap(({ foodId }) => (foodId === null ? [] : [foodId])),
      ),
    ),
  ];
  const cronometerFoods = await cronometer.foods(foodIds);
  const foodsById = new Map(cronometerFoods.map((food) => [food.id, food]));
  const servings = walk.days
    .toReversed()
    .flatMap(({ date, entries }) =>
      entries.map((entry, position) =>
        servingOf(
          date,
          entry,
          position,
          entry.foodId === null ? undefined : foodsById.get(entry.foodId),
        ),
      ),
    );

  const foods: ResolvedFood[] = [];
  for (const food of cronometerFoods) {
    await onProgress({
      phase: 'matching',
      done: foods.length,
      total: cronometerFoods.length,
    });
    foods.push({
      cronometer: food,
      resolution: await resolveFood(account, food),
    });
    await nextTurn();
  }
  const byId = new Map(foods.map((food) => [food.cronometer.id, food]));

  const meals = new Map<string, PlannedMeal>();
  const days = new Map<string, PlannedDay>();
  const skippedServings: ImportPlan['skippedServings'] = [];
  let fallbacks = 0;
  for (const serving of servings) {
    const outcome = planServing(
      serving,
      serving.foodId === null ? undefined : byId.get(serving.foodId),
    );
    if ('skipped' in outcome) {
      skippedServings.push({ serving, reason: outcome.skipped });
      continue;
    }
    fallbacks += outcome.fallback ? 1 : 0;
    const key = mealKey(serving);
    const meal = meals.get(key) ?? {
      date: serving.day,
      meal: mealOf(serving.mealGroup),
      time: timeOf(serving.time),
      items: [],
    };
    meal.items.push(outcome.planned);
    meals.set(key, meal);
    const day = days.get(serving.day) ?? {
      date: serving.day,
      cronometer: {},
      planned: {},
    };
    day.cronometer = sum([
      day.cronometer,
      withEnergy(cronometerNutrients(serving.nutrients)),
    ]);
    day.planned = sum([day.planned, outcome.planned.nutrients]);
    days.set(serving.day, day);
  }

  const range = { from: walk.firstDate, to };
  const weightDates = await account.weightDates(range);
  const weights: ImportPlan['weights'] = [];
  const skippedWeights: ImportPlan['skippedWeights'] = [];
  const seen = new Set<string>();
  for (const weight of await cronometer.weights(range)) {
    if (seen.has(weight.date)) {
      continue;
    }
    seen.add(weight.date);
    if (weightDates.has(weight.date)) {
      skippedWeights.push({ date: weight.date, reason: 'already logged' });
    } else if (!weightKgSchema.safeParse(weight.kilograms).success) {
      skippedWeights.push({ date: weight.date, reason: 'out of range' });
    } else {
      weights.push(weight);
    }
  }

  return {
    range,
    foods,
    meals: [...meals.values()],
    days: [...days.values()],
    skippedDays: walk.logged,
    skippedServings,
    weights,
    skippedWeights,
    fallbacks,
  };
};

const chunks = <Item>(items: readonly Item[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export type ApplyReport = {
  createdFoods: number;
  failedMeals: { meal: PlannedMeal; error: string }[];
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const applyImport = async (
  account: Account,
  plan: ImportPlan,
  onProgress: OnProgress = ignoreProgress,
): Promise<ApplyReport> => {
  const newFoods = plan.foods.filter(
    ({ resolution }) => resolution.kind === 'new',
  );
  const batches = plan.meals.flatMap((meal) =>
    chunks(meal.items, maxMealItems).map((items) => ({ meal, items })),
  );
  const total = newFoods.length + batches.length;
  let done = 0;
  const step = async () => {
    await onProgress({ phase: 'logging', done, total });
    done += 1;
    await nextTurn();
  };

  const created = new Map<number, string>();
  for (const { cronometer, resolution } of newFoods) {
    await step();
    if (resolution.kind === 'new') {
      const food = await account.createFood(resolution.fields);
      created.set(cronometer.id, food.id);
    }
  }

  const foodId = (ref: FoodRef) => {
    if (ref.kind === 'existing') {
      return ref.id;
    }
    const id = created.get(ref.cronometerId);
    if (id === undefined) {
      throw new Error(`Cronometer food ${ref.cronometerId} was not created`);
    }
    return id;
  };

  const failedMeals: ApplyReport['failedMeals'] = [];
  for (const { meal, items } of batches) {
    await step();
    try {
      await account.logMeal({
        date: meal.date,
        meal: meal.meal,
        time: meal.time,
        items: items.map((item) =>
          item.kind === 'food'
            ? {
                kind: 'food',
                foodId: foodId(item.food),
                portion: item.portion,
                quantity: item.quantity,
              }
            : {
                kind: 'quick',
                label: item.label,
                nutrients: { totals: item.nutrients },
              },
        ),
      });
    } catch (error) {
      failedMeals.push({ meal, error: errorMessage(error) });
    }
  }

  for (const [index, { date, kilograms }] of plan.weights.entries()) {
    await onProgress({
      phase: 'weights',
      done: index,
      total: plan.weights.length,
    });
    await account.logWeight(date, kilograms);
  }

  return { createdFoods: created.size, failedMeals };
};

const energyOf = (
  days: readonly PlannedDay[],
  side: 'cronometer' | 'planned',
) => days.reduce((total, day) => total + (day[side].energy_kcal ?? 0), 0);

const matchedTo = (resolution: FoodResolution) =>
  'food' in resolution ? resolution.food.name : null;

export const summaryOf = (
  plan: ImportPlan,
  report: ApplyReport,
): HistoryImportSummary => {
  const items = plan.meals.flatMap(({ items }) => items);
  return {
    days: plan.days.length,
    skippedDays: plan.skippedDays.length,
    entries: items.length,
    quickEntries: items.filter(({ kind }) => kind === 'quick').length,
    skippedEntries: plan.skippedServings.length,
    failedMeals: report.failedMeals.length,
    weights: plan.weights.length,
    skippedWeights: plan.skippedWeights.length,
    sourceKcal: energyOf(plan.days, 'cronometer'),
    importedKcal: energyOf(plan.days, 'planned'),
    foods: plan.foods.map(({ cronometer, resolution }) => ({
      sourceId: String(cronometer.id),
      name: cronometer.name,
      kind: resolution.kind,
      matchedTo: matchedTo(resolution),
    })),
  };
};
