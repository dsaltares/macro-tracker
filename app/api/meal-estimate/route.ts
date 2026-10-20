import { getMealEstimator } from '@/lib/ai/server';
import { resolveCaller } from '@/lib/auth/caller';
import { getDatabase } from '@/lib/db/client';
import { getLogger } from '@/lib/logger';
import { mealEstimateRoute } from '@/lib/meal-estimate/route';

export const POST = (request: Request) =>
  mealEstimateRoute({
    estimateMeal: getMealEstimator()?.estimateMeal ?? null,
    resolveCaller,
    db: getDatabase(),
    logger: getLogger('meal-estimate'),
  })(request);
