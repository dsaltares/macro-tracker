import { recipeRoute } from '@/lib/api/routes/recipes';
import { apiServer } from '@/lib/api/server';

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => recipeRoute(apiServer())(request, context);
