import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { LabelReading } from '../domain/foods/label-reading.ts';
import { createLabelReader } from './label-reader.ts';

const reading: LabelReading = {
  productName: { value: 'Oat biscuits', confidence: 0.95 },
  brand: null,
  netQuantity: { value: '300 g', confidence: 0.7 },
  servingSize: null,
  per100g: [
    { nutrient: 'energy_kj', printed: '1960', unit: 'kJ', confidence: 0.9 },
    { nutrient: 'salt', printed: '0,75', unit: 'g', confidence: 0.6 },
  ],
  perServing: [],
  notes: ['The brand is cut off'],
};

const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const answering = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
  });

const failingWith = (error: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
  });

const apiError = (statusCode: number | undefined) =>
  new APICallError({
    message: `Provider responded ${statusCode}`,
    url: 'https://ai.example.test/v1/responses',
    requestBodyValues: { image: 'the photo' },
    ...(statusCode !== undefined && { statusCode }),
    isRetryable: false,
  });

describe('createLabelReader', () => {
  it('answers the reading the model returns', async () => {
    const { readLabel } = createLabelReader({
      model: answering(JSON.stringify(reading)),
    });

    expect(await readLabel(image)).toEqual({ read: true, reading });
  });

  it('hands the model the photo, the instructions and the reading’s schema', async () => {
    const model = answering(JSON.stringify(reading));

    await createLabelReader({ model }).readLabel(image);

    const [call] = model.doGenerateCalls;
    expect(call?.prompt[0]).toMatchObject({ role: 'system' });
    expect(call?.prompt.at(-1)).toMatchObject({
      role: 'user',
      content: [
        { type: 'text' },
        { type: 'file', data: { type: 'data', data: image } },
      ],
    });
    expect(call?.responseFormat).toMatchObject({
      type: 'json',
      name: 'label_reading',
    });
  });

  it('sends a schema without the string lengths strict outputs refuse', async () => {
    const model = answering(JSON.stringify(reading));

    await createLabelReader({ model }).readLabel(image);

    const format = model.doGenerateCalls[0]?.responseFormat;
    const schema = JSON.stringify(format?.type === 'json' && format.schema);
    expect(schema).toContain('"per100g"');
    expect(schema).not.toContain('minLength');
  });

  it('answers unreadable when the model returns no JSON', async () => {
    const { readLabel } = createLabelReader({
      model: answering('I cannot see a label'),
    });

    expect(await readLabel(image)).toMatchObject({
      read: false,
      failure: 'unreadable',
    });
  });

  it('answers unreadable when the reading has no nutrient values', async () => {
    const { readLabel } = createLabelReader({
      model: answering(JSON.stringify({ ...reading, per100g: [] })),
    });

    expect(await readLabel(image)).toMatchObject({
      read: false,
      failure: 'unreadable',
    });
  });

  it.each([
    [429, 'rate-limited'],
    [400, 'rejected'],
    [503, 'unavailable'],
    [undefined, 'unavailable'],
  ] as const)('answers %s from the provider as %s', async (status, failure) => {
    const { readLabel } = createLabelReader({
      model: failingWith(apiError(status)),
    });

    expect(await readLabel(image)).toEqual({
      read: false,
      failure,
      message: `Provider responded ${status}`,
    });
  });

  it('answers unavailable when the provider cannot be reached', async () => {
    const { readLabel } = createLabelReader({
      model: failingWith(new TypeError('fetch failed')),
    });

    expect(await readLabel(image)).toEqual({
      read: false,
      failure: 'unavailable',
      message: 'fetch failed',
    });
  });

  it('never hands the photo back in a failure', async () => {
    const { readLabel } = createLabelReader({
      model: failingWith(apiError(400)),
    });

    const result = await readLabel(image);

    expect(Object.keys(result)).toEqual(['read', 'failure', 'message']);
  });
});
