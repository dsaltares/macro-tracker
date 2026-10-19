import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { zipOf } from '../../../../test/zip.ts';
import { findZipEntry, readZipEntry, zipEntries } from './zip.ts';

const csv = 'fdc_id,description\n1,Milk\n'.repeat(100);

const archive = zipOf([
  { name: 'FoodData_Central_csv/food.csv', content: Buffer.from(csv) },
  {
    name: 'FoodData_Central_csv/nutrient.csv',
    content: Buffer.from('id,name\n'),
    method: 0,
  },
]);

const entryText = (zip: Buffer, file: string) => {
  const entry = findZipEntry(zipEntries(zip), file);
  if (!entry) {
    throw new Error(`No ${file}`);
  }
  return text(readZipEntry(zip, entry));
};

describe('zipEntries', () => {
  it('lists every entry with its compression method', () => {
    expect(
      zipEntries(archive).map(({ name, method }) => [name, method]),
    ).toEqual([
      ['FoodData_Central_csv/food.csv', 8],
      ['FoodData_Central_csv/nutrient.csv', 0],
    ]);
  });

  it('fails on bytes that are not a zip archive', () => {
    expect(() => zipEntries(Buffer.from('not a zip archive at all'))).toThrow(
      'Not a zip archive',
    );
  });
});

describe('findZipEntry', () => {
  it('finds a file by its name inside the archive folder, not by a suffix of another', () => {
    const entries = zipEntries(
      zipOf([
        { name: 'dir/sr_legacy_food.csv', content: Buffer.from('') },
        { name: 'dir/food.csv', content: Buffer.from('') },
      ]),
    );

    expect(findZipEntry(entries, 'food.csv')?.name).toBe('dir/food.csv');
    expect(findZipEntry(entries, 'input_food.csv')).toBeUndefined();
  });
});

describe('readZipEntry', () => {
  it('inflates a deflated entry', async () => {
    expect(await entryText(archive, 'food.csv')).toBe(csv);
  });

  it('reads a stored entry as is', async () => {
    expect(await entryText(archive, 'nutrient.csv')).toBe('id,name\n');
  });

  it('refuses a compression method it cannot read', () => {
    const zip = zipOf([{ name: 'food.csv', content: Buffer.from('a') }]);
    const [entry] = zipEntries(zip);
    if (!entry) {
      throw new Error('No entry');
    }

    expect(() => readZipEntry(zip, { ...entry, method: 12 })).toThrow(
      'compression method 12',
    );
  });
});
