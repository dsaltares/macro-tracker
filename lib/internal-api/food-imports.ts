import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { StartFoodImport } from '../data/background-import.ts';
import {
  chooseSources,
  type SourceAdapters,
  sourceAdapters,
} from '../data/sources/registry.ts';
import { recentFoodImports } from '../db/food-imports.ts';
import type { Database } from '../db/schema.ts';
import { carriesBearerToken } from './bearer.ts';

const foodImportRequestSchema = z.strictObject({
  sources: z.array(z.string()).min(1).optional(),
});

const notFound = () => new Response(null, { status: 404 });

const badRequest = (error: string, details: object = {}) =>
  Response.json({ error, ...details }, { status: 400 });

const readJson = async (request: Request) => {
  const text = await request.text();
  if (text.trim() === '') {
    return { parsed: true as const, body: {} };
  }
  try {
    return { parsed: true as const, body: JSON.parse(text) as unknown };
  } catch {
    return { parsed: false as const };
  }
};

export type FoodImportRoutesOptions = {
  db: Kysely<Database>;
  token: string | undefined;
  startImport: StartFoodImport;
  adapters?: SourceAdapters;
};

export const foodImportRoutes = ({
  db,
  token,
  startImport,
  adapters = sourceAdapters,
}: FoodImportRoutesOptions) => ({
  GET: async (request: Request) => {
    if (!carriesBearerToken(request, token)) {
      return notFound();
    }
    return Response.json({ imports: await recentFoodImports(db) });
  },

  POST: async (request: Request) => {
    if (!carriesBearerToken(request, token)) {
      return notFound();
    }
    const json = await readJson(request);
    if (!json.parsed) {
      return badRequest('The body is not JSON');
    }
    const body = foodImportRequestSchema.safeParse(json.body);
    if (!body.success) {
      return badRequest('Invalid import request', {
        issues: body.error.issues,
      });
    }
    const chosen = chooseSources({ ids: body.data.sources, adapters });
    if (!chosen.found) {
      return badRequest('No source adapter for some sources', {
        unknown: chosen.unknown,
      });
    }
    if (chosen.sources.length === 0) {
      return badRequest('No source adapters are registered');
    }
    const start = await startImport(chosen.sources);
    return start.started
      ? Response.json(start.run, { status: 202 })
      : Response.json(start.running, { status: 409 });
  },
});
