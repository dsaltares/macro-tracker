import { createFoodRoute, searchFoodsRoute } from '@/lib/api/routes/foods';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) => searchFoodsRoute(apiServer())(request);

export const POST = (request: Request) => createFoodRoute(apiServer())(request);
