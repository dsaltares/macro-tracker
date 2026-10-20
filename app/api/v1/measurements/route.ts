import {
  listMeasurementsRoute,
  logMeasurementRoute,
} from '@/lib/api/routes/body';
import { apiServer } from '@/lib/api/server';

export const GET = (request: Request) =>
  listMeasurementsRoute(apiServer())(request);

export const POST = (request: Request) =>
  logMeasurementRoute(apiServer())(request);
