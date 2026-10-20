import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { type FoodWriteContext, insertFood } from '../db/foods.ts';
import { diaryCsvHeader } from '../domain/export/csv.ts';
import { exportSchema } from '../domain/export/schema.ts';
import { createCaller } from '../trpc/root.ts';
import { exportRoutes } from './routes.ts';

const database = migratedDatabasePerTest();

const signedInHeader = 'x-test-user';

let clock: FoodWriteContext;

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
  };
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
});

const routes = () =>
  exportRoutes({
    db: database(),
    now: clock.now,
    resolveCaller: async (headers) => {
      const userId = headers.get(signedInHeader);
      return userId === null ? null : { userId };
    },
  });

const as = (userId: string) =>
  createCaller({ db: database(), caller: { userId }, ...clock });

const get = (path: string, userId: string | null = 'user-1') =>
  new Request(`http://localhost/api/export/${path}`, {
    headers: userId === null ? {} : { [signedInHeader]: userId },
  });

const quick = (
  userId: string,
  date: string,
  label: string,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'lunch',
) =>
  as(userId).diary.addQuick({
    date,
    meal,
    label,
    nutrients: { totals: { energy_kcal: 300, protein: 20 } },
  });

const csvRows = async (response: Response) =>
  (await response.text()).split('\r\n').filter((row) => row !== '');

describe('the export routes', () => {
  describe.each([
    ['diaryCsv', 'diary.csv'],
    ['weightsCsv', 'weights.csv'],
    ['allJson', 'all.json'],
  ] as const)('%s', (route, path) => {
    it('answers 401 without a session', async () => {
      const response = await routes()[route](get(path, null));

      expect(response.status).toBe(401);
    });

    it('answers an attachment that is never cached', async () => {
      const response = await routes()[route](get(path));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toMatch(
        /^attachment; filename="macro-tracker-.+\.(csv|json)"$/,
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
  });

  describe('diary.csv', () => {
    it('is CSV with a byte order mark, so spreadsheets read it as UTF-8', async () => {
      const response = await routes().diaryCsv(get('diary.csv'));

      expect(response.headers.get('content-type')).toBe(
        'text/csv; charset=utf-8',
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    });

    it('writes the caller’s entries in day order, quoting a cell with a comma', async () => {
      await quick('user-1', '2026-10-20', 'Dinner out');
      await quick('user-1', '2026-10-19', 'Rice, beans and greens', 'dinner');
      await quick('user-1', '2026-10-19', 'Toast', 'breakfast');
      await quick('user-2', '2026-10-19', 'Not mine');

      const rows = await csvRows(await routes().diaryCsv(get('diary.csv')));

      expect(rows).toHaveLength(4);
      expect(rows[0]).toBe(diaryCsvHeader.join(','));
      expect(rows.slice(1).map((row) => row.split(',').slice(0, 4))).toEqual([
        ['2026-10-19', 'breakfast', '', 'Toast'],
        ['2026-10-19', 'dinner', '', '"Rice'],
        ['2026-10-20', 'lunch', '', 'Dinner out'],
      ]);
      expect(rows[2]).toMatch(
        /^2026-10-19,dinner,,"Rice, beans and greens",,300,20,/,
      );
    });

    it('keeps to the range it is given, inclusive, and names the file after it', async () => {
      for (const date of ['2026-10-17', '2026-10-18', '2026-10-19']) {
        await quick('user-1', date, `Lunch on ${date}`);
      }

      const response = await routes().diaryCsv(
        get('diary.csv?from=2026-10-18&to=2026-10-19'),
      );

      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="macro-tracker-diary-from-2026-10-18-to-2026-10-19.csv"',
      );
      expect(
        (await csvRows(response)).slice(1).map((row) => row.slice(0, 10)),
      ).toEqual(['2026-10-18', '2026-10-19']);
    });

    it.each([
      ['a date that is not one', 'from=2026-02-30'],
      ['a range that ends before it starts', 'from=2026-10-20&to=2026-10-19'],
    ])('answers 400 to %s', async (_, query) => {
      const response = await routes().diaryCsv(get(`diary.csv?${query}`));

      expect(response.status).toBe(400);
    });
  });

  describe('weights.csv', () => {
    it('writes the caller’s weights oldest first, within the range', async () => {
      for (const [date, value] of [
        ['2026-10-20', 72.1],
        ['2026-10-18', 72.6],
        ['2026-10-19', 72.4],
      ] as const) {
        await as('user-1').body.log({ date, metric: 'weight_kg', value });
      }
      await as('user-2').body.log({
        date: '2026-10-19',
        metric: 'weight_kg',
        value: 90,
      });

      const response = await routes().weightsCsv(
        get('weights.csv?from=2026-10-19'),
      );

      expect(response.headers.get('content-type')).toBe(
        'text/csv; charset=utf-8',
      );
      expect(await csvRows(response)).toEqual([
        'date,weight_kg',
        '2026-10-19,72.4',
        '2026-10-20,72.1',
      ]);
    });
  });

  describe('all.json', () => {
    it('is everything the caller owns, in the export schema', async () => {
      await as('user-1').profile.upsert({
        sex: 'female',
        birthDate: '1990-04-02',
        heightCm: 168,
        activityLevel: 'moderate',
      });
      await as('user-1').goals.set({
        mode: 'derived',
        weeklyRateKg: -0.5,
        proteinGPerKg: 1.8,
        fatEnergyShare: 0.3,
        overrides: { fibre: 35 },
      });
      const oatsId = await insertFood(
        database(),
        {
          source: 'user',
          owner_user_id: 'user-1',
          barcode: null,
          name: 'Overnight oats',
          brand: null,
          quantity_label: null,
          nutrients: { energy_kcal: 120, protein: 5 },
          portions: [{ label: '1 jar', grams: 250 }],
        },
        clock,
      );
      await insertFood(
        database(),
        {
          source: 'user',
          owner_user_id: 'user-2',
          barcode: null,
          name: 'Not mine',
          brand: null,
          quantity_label: null,
          nutrients: {},
          portions: [],
        },
        clock,
      );
      await as('user-1').diary.addFood({
        date: '2026-10-20',
        meal: 'breakfast',
        foodId: oatsId,
        portion: '1 jar',
        quantity: 1,
      });
      await quick('user-2', '2026-10-20', 'Not mine');
      await as('user-1').body.log({
        date: '2026-10-20',
        metric: 'weight_kg',
        value: 72.1,
      });

      const response = await routes().allJson(get('all.json'));

      expect(response.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      );
      expect(response.headers.get('content-disposition')).toMatch(
        /filename="macro-tracker-2026-10-20\.json"$/,
      );
      const exported = exportSchema.parse(await response.json());
      expect(exported).toMatchObject({
        version: 1,
        profile: { sex: 'female', heightCm: 168 },
        goals: { weeklyRateKg: -0.5, overrides: { fibre: 35 } },
        foods: [
          {
            id: oatsId,
            name: 'Overnight oats',
            nutrients: { energy_kcal: 120, protein: 5 },
            portions: [{ label: '1 jar', grams: 250 }],
          },
        ],
        entries: [
          {
            kind: 'food',
            foodId: oatsId,
            label: 'Overnight oats',
            grams: 250,
            nutrients: { energy_kcal: 300, protein: 12.5 },
          },
        ],
        measurements: [
          { date: '2026-10-20', metric: 'weight_kg', value: 72.1 },
        ],
      });
      expect(exported.foods).toHaveLength(1);
      expect(exported.entries).toHaveLength(1);
    });

    it('is valid for an account that has logged nothing', async () => {
      const response = await routes().allJson(get('all.json', 'user-2'));

      expect(exportSchema.parse(await response.json())).toMatchObject({
        profile: null,
        foods: [],
        entries: [],
        measurements: [],
      });
    });
  });
});
