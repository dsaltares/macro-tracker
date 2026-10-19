import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sampleFixturePath } from '../lib/data/sources/fixture.ts';
import {
  brokenProduct,
  offSampleCsv,
  offSamplePath,
  readOffExportHeader,
} from './off-sample.ts';

const header = [
  'code',
  'product_name',
  'brands_en',
  'countries_tags',
  'last_modified_datetime',
  'last_modified_t',
  'serving_quantity',
  'fat_100g',
  'url',
];

describe('offSampleCsv', () => {
  it('writes each product as a row of the export, columns as the export names them', () => {
    const csv = offSampleCsv(
      JSON.stringify({
        code: '8480000592569',
        product_name: 'Jamón cocido lonchas',
        brands: 'Hacienda Real',
        countries_tags: ['en:spain', 'en:france'],
        last_modified_t: 1792161297,
        serving_quantity: 30,
        nutriments: { fat_100g: 2.5, fat_serving: 0.75 },
      }),
      header,
    );

    expect(csv.split('\n').slice(0, 2)).toEqual([
      header.join('\t'),
      [
        '8480000592569',
        'Jamón cocido lonchas',
        'Hacienda Real',
        'en:spain,en:france',
        '1792161297',
        '2026-10-16T14:34:57Z',
        '30',
        '2.5',
        '',
      ].join('\t'),
    ]);
  });

  it('leaves generic foods out', () => {
    const csv = offSampleCsv(
      JSON.stringify({ source: 'usda', sourceId: '1' }),
      header,
    );

    expect(csv.trim().split('\n')).toHaveLength(3);
  });

  it('ends with a product broken across two lines, as the real export has them', () => {
    const lines = offSampleCsv('{"code": "1"}', header)
      .split('\n')
      .slice(0, -1);

    expect(lines.slice(-2).map((line) => line.split('\t').length)).toEqual([
      2, 8,
    ]);
    expect(lines.at(-2)).toBe(`${brokenProduct.code}\tTurrón de Jijona`);
  });
});

describe('the Open Food Facts sample export', () => {
  it('is what `yarn data:sample` builds from the sample fixture', () => {
    expect(readFileSync(offSamplePath, 'utf8')).toBe(
      offSampleCsv(
        readFileSync(sampleFixturePath, 'utf8'),
        readOffExportHeader(),
      ),
    );
  });
});
