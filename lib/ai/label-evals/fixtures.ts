import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  type LabelReading,
  labelReadingSchema,
} from '../../domain/foods/label-reading.ts';

export const labelFixturesDirectory = new URL(
  '../../../test/fixtures/labels/',
  import.meta.url,
);

const labelFixtureSchema = z.strictObject({
  source: z.url(),
  photo: z.url(),
  reading: labelReadingSchema,
});

export type LabelFixture = {
  name: string;
  source: string;
  photo: Uint8Array;
  expected: LabelReading;
};

export const readLabelFixtures = (
  directory: URL = labelFixturesDirectory,
): LabelFixture[] =>
  readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.json$/, '');
      const { source, reading } = labelFixtureSchema.parse(
        JSON.parse(readFileSync(new URL(file, directory), 'utf8')),
      );
      return {
        name,
        source,
        photo: readFileSync(new URL(`${name}.jpg`, directory)),
        expected: reading,
      };
    });
