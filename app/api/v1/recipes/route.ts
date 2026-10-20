import { listRecipesRoute } from '@/lib/api/routes/recipes';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) => listRecipesRoute(apiServer())(request);
