import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { importFoodsInBackground } from '../data/background-import.ts';
import type { FoodSource } from '../data/sources/types.ts';
import type { SourceFood } from '../domain/foods/source-food.ts';
import { foodImportRoutes } from './food-imports.ts';

const database = migratedDatabasePerTest();

const token = 'internal-secret';
const url = 'http://localhost/api/internal/imports/foods';

let workDir = '';
let gate: { release: () => void; released: Promise<void> };

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-internal-'));
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  gate = { release, released };
});

afterEach(async () => {
  gate.release();
  await expect
    .poll(() =>
      database()
        .selectFrom('food_imports')
        .select('id')
        .where('status', '=', 'running')
        .executeTakeFirst(),
    )
    .toBeUndefined();
  await rm(workDir, { recursive: true, force: true });
});

const banana: SourceFood = {
  source: 'usda',
  sourceId: '173944',
  barcode: null,
  name: 'Bananas, raw',
  brand: null,
  quantityLabel: null,
  nutrients: { energy_kcal: 89, protein: 1.09 },
  traces: [],
  portions: [],
  lastModified: null,
};

const gatedUsda = (): FoodSource => ({
  id: 'usda',
  emits: ['usda'],
  async *fetch() {
    await gate.released;
    yield banana;
  },
});

const routes = (configuredToken: string | undefined = token) => {
  let ids = 0;
  let seconds = 0;
  return foodImportRoutes({
    db: database(),
    token: configuredToken,
    adapters: { usda: gatedUsda },
    startImport: (sources) =>
      importFoodsInBackground({
        db: database(),
        sources,
        clock: {
          nextId: () => `import-${++ids}`,
          now: () =>
            new Date(Date.UTC(2026, 9, 19, 12, 0, seconds++)).toISOString(),
        },
        logger: pino({ enabled: false }),
        signal: new AbortController().signal,
        workDir,
      }),
  });
};

const request = (
  method: 'GET' | 'POST',
  { authorization = `Bearer ${token}`, body = '' } = {},
) =>
  new Request(url, {
    method,
    headers: authorization ? { authorization } : {},
    ...(method === 'POST' ? { body } : {}),
  });

const importStatus = (id: string) =>
  database()
    .selectFrom('food_imports')
    .select('status')
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
    .then(({ status }) => status);

describe('the internal food import routes', () => {
  describe.each(['GET', 'POST'] as const)('%s', (method) => {
    it.each([
      ['no Authorization header', ''],
      ['the wrong token', 'Bearer not-the-secret'],
      ['another scheme', `Basic ${token}`],
      ['a token with extra characters', `Bearer ${token}x`],
    ])('answers 404 to %s', async (_, authorization) => {
      const response = await routes()[method](
        request(method, { authorization }),
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    });

    it('answers 404 to everyone when no token is configured', async () => {
      for (const configured of [undefined, '']) {
        const response = await routes(configured)[method](
          request(method, { authorization: 'Bearer ' }),
        );

        expect(response.status).toBe(404);
      }
    });
  });

  it('does not start an import for a request without the token', async () => {
    await routes().POST(request('POST', { authorization: '' }));

    expect(
      await database().selectFrom('food_imports').selectAll().execute(),
    ).toEqual([]);
  });

  it('starts an import in the background and answers 202 with its row', async () => {
    const response = await routes().POST(request('POST'));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: 'import-1',
      sources: 'usda',
      status: 'running',
      started_at: '2026-10-19T12:00:00.000Z',
      finished_at: null,
      inserted: 0,
      updated: 0,
      archived: 0,
      error: null,
    });
    gate.release();
    await expect.poll(() => importStatus('import-1')).toBe('succeeded');
  });

  it('imports the sources the body names', async () => {
    const response = await routes().POST(
      request('POST', { body: JSON.stringify({ sources: ['usda'] }) }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ sources: 'usda' });
  });

  it('answers 409 with the running import while one runs', async () => {
    const api = routes();
    await api.POST(request('POST'));

    const second = await api.POST(request('POST'));

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      id: 'import-1',
      status: 'running',
    });
    gate.release();
    await expect.poll(() => importStatus('import-1')).toBe('succeeded');
    expect((await api.POST(request('POST'))).status).toBe(202);
  });

  it.each([
    ['a body that is not JSON', '{'],
    ['a source with no adapter', JSON.stringify({ sources: ['ciqual'] })],
    ['an unknown source', JSON.stringify({ sources: ['nope'] })],
    ['an empty list of sources', JSON.stringify({ sources: [] })],
    ['an unknown field', JSON.stringify({ everything: true })],
  ])('answers 400 to %s', async (_, body) => {
    const response = await routes().POST(request('POST', { body }));

    expect(response.status).toBe(400);
    expect(
      await database().selectFrom('food_imports').selectAll().execute(),
    ).toEqual([]);
  });

  it('lists recent imports, newest first', async () => {
    const api = routes();
    await api.POST(request('POST'));
    gate.release();
    await expect.poll(() => importStatus('import-1')).toBe('succeeded');
    await api.POST(request('POST'));

    const response = await api.GET(request('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      imports: [
        expect.objectContaining({ status: 'running' }),
        expect.objectContaining({ id: 'import-1', status: 'succeeded' }),
      ],
    });
  });
});
