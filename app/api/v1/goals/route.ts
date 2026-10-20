import { goalsRoute, setGoalsRoute } from '@/lib/api/routes/goals';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) => goalsRoute(apiServer())(request);

export const PUT = (request: Request) => setGoalsRoute(apiServer())(request);
