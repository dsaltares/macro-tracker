import { describe, expect, it } from 'vitest';
import { createLabelReader } from '../label-reader.ts';
import { resolveLanguageModel } from '../model.ts';
import { type LabelFixture, readLabelFixtures } from './fixtures.ts';
import {
  accuracy,
  addTallies,
  type ReadingScore,
  scoreReading,
} from './score.ts';

const requiredEuAccuracy = 0.9;
const concurrentReadings = 4;

const model = resolveLanguageModel();

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

const mapConcurrently = async <T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
};

type FixtureResult = {
  fixture: LabelFixture;
  score: ReadingScore;
  failure: string | null;
  seconds: number;
};

describe.skipIf(model === null)('reading the label fixtures', () => {
  it('reads the EU mandatory fields of the fixtures', async () => {
    if (model === null) {
      return;
    }
    const { readLabel } = createLabelReader({ model });
    const results = await mapConcurrently(
      readLabelFixtures(),
      concurrentReadings,
      async (fixture): Promise<FixtureResult> => {
        const started = performance.now();
        const result = await readLabel(fixture.photo);
        return {
          fixture,
          score: scoreReading(
            fixture.expected,
            result.read ? result.reading : null,
          ),
          failure: result.read ? null : `${result.failure}: ${result.message}`,
          seconds: (performance.now() - started) / 1000,
        };
      },
    );

    const eu = addTallies(results.map(({ score }) => score.eu));
    const other = addTallies(results.map(({ score }) => score.other));
    console.table(
      results.map(({ fixture, score, failure, seconds }) => ({
        fixture: fixture.name,
        eu: `${score.eu.correct}/${score.eu.total}`,
        other: `${score.other.correct}/${score.other.total}`,
        seconds: seconds.toFixed(1),
        misses: failure ?? score.misses.join(' '),
        extras: score.extras.join(' '),
      })),
    );
    console.table({
      'EU mandatory per 100 g': { accuracy: percent(accuracy(eu)), ...eu },
      'everything else': { accuracy: percent(accuracy(other)), ...other },
    });

    expect(accuracy(eu)).toBeGreaterThanOrEqual(requiredEuAccuracy);
  });
});
