import { removeMeasurementRoute } from '@/lib/api/routes/body';
import { apiServer } from '@/lib/api/server';

export const DELETE = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => removeMeasurementRoute(apiServer())(request, context);
