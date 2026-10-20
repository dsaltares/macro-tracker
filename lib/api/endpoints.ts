import type { ApiEndpoint } from './handler.ts';
import {
  listMeasurementsRoute,
  logMeasurementRoute,
  removeMeasurementRoute,
} from './routes/body.ts';
import {
  addEntryRoute,
  copyMealRoute,
  diaryDayRoute,
  removeEntryRoute,
  updateEntryRoute,
} from './routes/diary.ts';
import {
  createFoodRoute,
  foodByBarcodeRoute,
  foodPortionsRoute,
  foodRoute,
  searchFoodsRoute,
} from './routes/foods.ts';
import { goalsRoute, setGoalsRoute } from './routes/goals.ts';
import { meRoute } from './routes/me.ts';
import { listRecipesRoute, recipeRoute } from './routes/recipes.ts';
import { trendsRoute } from './routes/trends.ts';

export const apiEndpoints: readonly ApiEndpoint[] = [
  meRoute,
  searchFoodsRoute,
  foodRoute,
  foodPortionsRoute,
  foodByBarcodeRoute,
  createFoodRoute,
  diaryDayRoute,
  addEntryRoute,
  updateEntryRoute,
  removeEntryRoute,
  copyMealRoute,
  listMeasurementsRoute,
  logMeasurementRoute,
  removeMeasurementRoute,
  goalsRoute,
  setGoalsRoute,
  listRecipesRoute,
  recipeRoute,
  trendsRoute,
].map(({ endpoint }) => endpoint);
