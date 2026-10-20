import { diaryDayRoute } from '@/lib/api/routes/diary';
import { apiServer } from '@/lib/api/server';

export const GET = (
  request: Request,
  context: { params: Promise<{ date: string }> },
) => diaryDayRoute(apiServer())(request, context);
