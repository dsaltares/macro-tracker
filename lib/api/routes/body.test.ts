import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { addDays } from '../../domain/dates.ts';
import { cursorOf } from '../pagination.ts';
import {
  listMeasurementsRoute,
  logMeasurementRoute,
  measurementPageSize,
  removeMeasurementRoute,
} from './body.ts';

const database = migratedDatabasePerTest();
const { keyFor, call, app } = restClient(database);

let reader: string;
let writer: string;

const weight = (date: string, value: number) => ({
  date,
  metric: 'weight_kg' as const,
  value,
});

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values(
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
  reader = await keyFor('user-1', ['read']);
  writer = await keyFor('user-1', ['write']);
});

describe('POST /api/v1/measurements', () => {
  it('logs a weight and answers it with 201', async () => {
    const response = await call(logMeasurementRoute, {
      key: writer,
      method: 'POST',
      body: weight('2026-10-20', 72.4),
    });

    expect(response.status).toBe(201);
    const logged = await response.json();
    expect(logged).toEqual({
      id: expect.any(String),
      ...weight('2026-10-20', 72.4),
    });
    expect(await app('user-1').body.list({ metric: 'weight_kg' })).toEqual([
      logged,
    ]);
  });

  it('replaces the weight of a date it already has, keeping its id', async () => {
    const first = await (
      await call(logMeasurementRoute, {
        key: writer,
        method: 'POST',
        body: weight('2026-10-20', 72.4),
      })
    ).json();

    const second = await (
      await call(logMeasurementRoute, {
        key: writer,
        method: 'POST',
        body: weight('2026-10-20', 72.1),
      })
    ).json();

    expect(second).toEqual({ ...first, value: 72.1 });
  });

  it('refuses a weight out of bounds with the issue', async () => {
    const response = await call(logMeasurementRoute, {
      key: writer,
      method: 'POST',
      body: weight('2026-10-20', 4),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST', issues: [{ path: ['value'] }] },
    });
  });

  it('needs the write scope', async () => {
    const response = await call(logMeasurementRoute, {
      key: reader,
      method: 'POST',
      body: weight('2026-10-20', 72.4),
    });

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/measurements', () => {
  beforeEach(async () => {
    await app('user-1').body.log(weight('2026-10-18', 73));
    await app('user-1').body.log(weight('2026-10-20', 72.4));
    await app('user-1').body.log(weight('2026-10-19', 72.8));
    await app('user-2').body.log(weight('2026-10-19', 90));
  });

  it("is the key's user's weights, newest first", async () => {
    const response = await call(listMeasurementsRoute, { key: reader });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { id: expect.any(String), ...weight('2026-10-20', 72.4) },
        { id: expect.any(String), ...weight('2026-10-19', 72.8) },
        { id: expect.any(String), ...weight('2026-10-18', 73) },
      ],
      nextCursor: null,
    });
  });

  it('reads an inclusive range', async () => {
    const response = await call(listMeasurementsRoute, {
      key: reader,
      query: { from: '2026-10-19', to: '2026-10-19' },
    });

    expect(await response.json()).toMatchObject({
      items: [weight('2026-10-19', 72.8)],
    });
  });

  it('refuses a range that ends before it starts', async () => {
    const response = await call(listMeasurementsRoute, {
      key: reader,
      query: { from: '2026-10-20', to: '2026-10-19' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: ['to'] }] },
    });
  });

  it('pages by the cursor it hands out', async () => {
    for (let day = 0; day < measurementPageSize; day++) {
      await app('user-1').body.log(weight(addDays('2025-01-01', day), 70));
    }

    const first = await (
      await call(listMeasurementsRoute, { key: reader })
    ).json();
    const second = await (
      await call(listMeasurementsRoute, {
        key: reader,
        query: { cursor: first.nextCursor },
      })
    ).json();

    expect(first.items).toHaveLength(measurementPageSize);
    expect(first.nextCursor).toBe(cursorOf(measurementPageSize));
    expect(second.items).toHaveLength(3);
    expect(second.items.at(-1).date).toBe('2025-01-01');
    expect(second.nextCursor).toBeNull();
  });

  it('needs the read scope', async () => {
    const response = await call(listMeasurementsRoute, { key: writer });

    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/v1/measurements/{id}', () => {
  it("removes a weight of the key's user with 204", async () => {
    const { id } = await app('user-1').body.log(weight('2026-10-20', 72.4));

    const response = await call(removeMeasurementRoute, {
      key: writer,
      method: 'DELETE',
      params: { id },
    });

    expect(response.status).toBe(204);
    expect(await app('user-1').body.list({ metric: 'weight_kg' })).toEqual([]);
  });

  it("answers 404 for another user's weight and keeps it", async () => {
    const { id } = await app('user-2').body.log(weight('2026-10-20', 90));

    const response = await call(removeMeasurementRoute, {
      key: writer,
      method: 'DELETE',
      params: { id },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(await app('user-2').body.list({ metric: 'weight_kg' })).toHaveLength(
      1,
    );
  });
});
