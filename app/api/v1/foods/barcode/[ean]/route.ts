import { foodByBarcodeRoute } from '@/lib/api/routes/foods';
import { apiServer } from '@/lib/api/server';

export const GET = (
  request: Request,
  context: { params: Promise<{ ean: string }> },
) => foodByBarcodeRoute(apiServer())(request, context);
