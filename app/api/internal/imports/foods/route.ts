import { serverFoodImport } from '@/lib/data/background-import';
import { getDatabase } from '@/lib/db/client';
import { foodImportRoutes } from '@/lib/internal-api/food-imports';

const routes = () =>
  foodImportRoutes({
    db: getDatabase(),
    token: process.env.INTERNAL_API_TOKEN,
    startImport: serverFoodImport(getDatabase()),
  });

export const GET = (request: Request) => routes().GET(request);

export const POST = (request: Request) => routes().POST(request);
