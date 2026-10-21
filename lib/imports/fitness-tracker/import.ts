import { nextTurn } from '../../data/import-foods.ts';
import { weightKgSchema } from '../../domain/body/measurements.ts';
import { today } from '../../domain/dates.ts';
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
import type { DateRange, FitnessTracker } from './clients.ts';
import {
  type CronometerFood,
  type CronometerServing,
  cronometerNutrients,
  foodNutrientsPer100g,
  isQuickAdd,
  mealOf,
  productNameOf,
  referenceIdOf,
  servingGrams,
  timeOf,
  userFoodOf,
  type WeighIn,
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

export const earliestWeighInPerDay = (
  weighIns: readonly WeighIn[],
  timeZone: string,
) => {
  const earliest = new Map<string, WeighIn>();
  for (const weighIn of weighIns) {
    const date = today({ now: () => weighIn.measured_at }, timeZone);
    const kept = earliest.get(date);
    if (kept === undefined || weighIn.measured_at < kept.measured_at) {
      earliest.set(date, weighIn);
    }
  }
  return [...earliest]
    .map(([date, { weight }]) => ({ date, kilograms: weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  const snapshot = withEnergy(cronometerNutrients(serving.nutrients_json));
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
          { kind: 'new', cronometerId: resolved.cronometer.food_id },
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
    serving.measure_name,
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
  [serving.day, mealOf(serving.meal_group), timeOf(serving.time)].join('|');

type OnProgress = (progress: HistoryImportProgress) => Promise<void> | void;

const ignoreProgress: OnProgress = () => {};

export const planImport = async ({
  fitnessTracker,
  account,
  range,
  timeZone,
  onProgress = ignoreProgress,
}: {
  fitnessTracker: FitnessTracker;
  account: Account;
  range: DateRange;
  timeZone: string;
  onProgress?: OnProgress;
}): Promise<ImportPlan> => {
  await onProgress({ phase: 'reading', done: 0, total: 0 });
  const servings = await fitnessTracker.servings(range);
  const dates = [...new Set(servings.map(({ day }) => day))];
  const logged = new Set<string>();
  for (const date of dates) {
    if (await account.hasEntriesOn(date)) {
      logged.add(date);
    }
  }
  const toImport = servings.filter(({ day }) => !logged.has(day));

  const foodIds = [
    ...new Set(
      toImport.flatMap(({ food_id }) => (food_id === null ? [] : [food_id])),
    ),
  ];
  const cronometerFoods = await fitnessTracker.foods(foodIds);
  const foods: ResolvedFood[] = [];
  for (const cronometer of cronometerFoods) {
    await onProgress({
      phase: 'matching',
      done: foods.length,
      total: cronometerFoods.length,
    });
    foods.push({
      cronometer,
      resolution: await resolveFood(account, cronometer),
    });
    await nextTurn();
  }
  const byId = new Map(foods.map((food) => [food.cronometer.food_id, food]));

  const meals = new Map<string, PlannedMeal>();
  const days = new Map<string, PlannedDay>();
  const skippedServings: ImportPlan['skippedServings'] = [];
  let fallbacks = 0;
  for (const serving of toImport) {
    const outcome = planServing(
      serving,
      serving.food_id === null ? undefined : byId.get(serving.food_id),
    );
    if ('skipped' in outcome) {
      skippedServings.push({ serving, reason: outcome.skipped });
      continue;
    }
    fallbacks += outcome.fallback ? 1 : 0;
    const key = mealKey(serving);
    const meal = meals.get(key) ?? {
      date: serving.day,
      meal: mealOf(serving.meal_group),
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
      withEnergy(cronometerNutrients(serving.nutrients_json)),
    ]);
    day.planned = sum([day.planned, outcome.planned.nutrients]);
    days.set(serving.day, day);
  }

  const weighIns = earliestWeighInPerDay(
    await fitnessTracker.weighIns(range),
    timeZone,
  ).filter(({ date }) => date >= range.from && date <= range.to);
  const weightDates = await account.weightDates(range);
  const weights: ImportPlan['weights'] = [];
  const skippedWeights: ImportPlan['skippedWeights'] = [];
  for (const weight of weighIns) {
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
    skippedDays: [...logged].sort(),
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
      created.set(cronometer.food_id, food.id);
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
      sourceId: String(cronometer.food_id),
      name: cronometer.name,
      kind: resolution.kind,
      matchedTo: matchedTo(resolution),
    })),
  };
};
