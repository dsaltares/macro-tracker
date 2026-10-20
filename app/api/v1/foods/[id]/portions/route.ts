import { foodPortionsRoute } from '@/lib/api/routes/foods';
import { apiServer } from '@/lib/api/server';

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => foodPortionsRoute(apiServer())(request, context);
