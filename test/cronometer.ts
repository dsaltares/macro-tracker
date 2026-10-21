import { cronometerDay } from '@/lib/imports/cronometer/client';

export const cronometerEmail = 'eater@example.test';
export const cronometerPassword = 'cronometer-test-password';

export type FakeFood = {
  id: number;
  name: string;
  source: string;
  defaultMeasureId?: number;
  measures: { id: number; name: string; value: number; type: string }[];
  nutrients: { id: number; amount: number }[];
};

export type FakeServing = {
  foodId: number;
  measureId: number;
  grams: number;
  order?: number;
  time?: string;
};

export type FakeCronometer = {
  diary?: Record<string, FakeServing[]>;
  foods?: FakeFood[];
  weights?: { day: string; value: number }[];
  failing?: string;
};

const userId = 42;
const sessionKey = 'session-1';

const breakfast = 1 << 16;

export const fakeCronometer = ({
  diary = {},
  foods = [],
  weights = [],
  failing,
}: FakeCronometer = {}) => {
  const requests: { endpoint: string; body: Record<string, unknown> }[] = [];
  const byDay = new Map(
    Object.entries(diary).map(([date, servings]) => [
      cronometerDay(date),
      servings,
    ]),
  );

  const answer = async (request: Request) => {
    const endpoint = new URL(request.url).pathname.split('/').at(-1) ?? '';
    const body = JSON.parse(await request.text()) as Record<string, unknown>;
    requests.push({ endpoint, body });
    if (endpoint === failing) {
      return new Response('down', { status: 500 });
    }
    if (endpoint === 'login') {
      return body.email === cronometerEmail &&
        body.password === cronometerPassword
        ? Response.json({ id: userId, sessionKey, timezone: 'Europe/Madrid' })
        : Response.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const auth = body.auth as { token?: string } | undefined;
    if (auth?.token !== sessionKey) {
      return Response.json({ result: 'FAIL' });
    }
    if (endpoint === 'get_diary') {
      const servings = byDay.get(String(body.day)) ?? [];
      return Response.json({
        diary: [
          ...servings.map((serving, index) => ({
            type: 'Serving',
            day: body.day,
            time: serving.time ?? null,
            servingId: `${body.day}-${index}`,
            foodId: serving.foodId,
            measureId: serving.measureId,
            grams: serving.grams,
            order: serving.order ?? breakfast,
          })),
          ...(servings.length > 0 ? [{ type: 'Note', text: 'Ate well' }] : []),
        ],
      });
    }
    if (endpoint === 'get_foods') {
      const ids = body.ids as number[];
      return Response.json({
        foods: foods.filter(({ id }) => ids.includes(id)),
      });
    }
    if (endpoint === 'get_metrics') {
      return Response.json({
        metrics: [
          {
            id: 1,
            name: 'Weight',
            units: [
              { id: 2, name: 'lbs' },
              { id: 1, name: 'kg' },
            ],
          },
          { id: 3, name: 'Body Fat', units: [{ id: 5, name: '%' }] },
        ],
      });
    }
    if (endpoint === 'get_biometrics') {
      return Response.json({
        data: body.metricId === 1 && body.unitId === 1 ? weights : [],
      });
    }
    return new Response(null, { status: 404 });
  };

  const fetch: typeof globalThis.fetch = (input, init) =>
    answer(new Request(input, init));

  return { answer, fetch, requests };
};
