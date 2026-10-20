import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  type SourceFood,
  sourceFoodSchema,
} from '../../domain/foods/source-food.ts';
import { referenceSources } from '../../domain/foods/sources.ts';
import {
  offProductSchema,
  sourceFoodFromOff,
} from './open-food-facts/mapping.ts';
import type { FoodSource } from './types.ts';

export const sampleFixturePath = resolve('test/fixtures/foods/sample.jsonl');

const isSourceFood = (record: unknown) =>
  typeof record === 'object' && record !== null && 'source' in record;

export const parseFixtureLine = (line: string): SourceFood => {
  const record: unknown = JSON.parse(line);
  if (isSourceFood(record)) {
    return sourceFoodSchema.parse(record);
  }
  const mapped = sourceFoodFromOff(offProductSchema.parse(record));
  if (!mapped.success) {
    throw new Error(mapped.reason);
  }
  return mapped.food;
};

const parseLineAt = (line: string, location: string) => {
  try {
    return parseFixtureLine(line);
  } catch (error) {
    throw new Error(`${location}: not a valid fixture line`, {
      cause: error,
    });
  }
};

export const createFixtureSource = (
  path: string = sampleFixturePath,
): FoodSource => ({
  id: 'fixture',
  kind: 'full',
  emits: referenceSources,
  async *fetch({ logger, signal }) {
    const lines = createInterface({
      input: createReadStream(path, { signal }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    let lineNumber = 0;
    let foods = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim() === '') {
        continue;
      }
      yield parseLineAt(line, `${path}:${lineNumber}`);
      foods += 1;
    }
    logger.debug({ path, foods }, 'read the food fixture');
  },
});
