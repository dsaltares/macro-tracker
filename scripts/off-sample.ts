import { readFileSync } from 'node:fs';

export const offExportHeaderPath = 'test/fixtures/off/export-header.tsv';
export const offSamplePath = 'test/fixtures/off/sample.csv';

type SampleProduct = {
  code: string;
  product_name?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  countries_tags?: string[];
  last_modified_t?: number;
  nutriments?: Record<string, unknown>;
};

export const brokenProduct: SampleProduct = {
  code: '8410076472960',
  product_name: 'Turrón de Jijona\nsin azúcar añadido',
  brands: 'El Almendro',
  countries_tags: ['en:spain'],
  last_modified_t: 1792161297,
  nutriments: { 'energy-kcal_100g': 560, proteins_100g: 12, fat_100g: 38 },
};

const millisecondsPerSecond = 1000;

const isoFrom = (seconds: number | undefined) =>
  seconds === undefined
    ? ''
    : new Date(seconds * millisecondsPerSecond)
        .toISOString()
        .replace('.000', '');

const asField = (value: unknown) =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : '';

const fieldOf = (product: SampleProduct, column: string) => {
  switch (column) {
    case 'brands_en':
      return asField(product.brands);
    case 'countries_tags':
      return (product.countries_tags ?? []).join(',');
    case 'last_modified_datetime':
      return asField(product.last_modified_t);
    case 'last_modified_t':
      return isoFrom(product.last_modified_t);
    default:
      return column.endsWith('_100g')
        ? asField(product.nutriments?.[column])
        : asField(product[column as keyof SampleProduct]);
  }
};

const rowOf = (header: string[], product: SampleProduct) =>
  header.map((column) => fieldOf(product, column)).join('\t');

const isOffProduct = (record: object): record is SampleProduct =>
  !('source' in record);

export const offSampleCsv = (sampleJsonl: string, header: string[]) => {
  const products = sampleJsonl
    .trim()
    .split('\n')
    .map((line): object => JSON.parse(line))
    .filter(isOffProduct);
  return `${[header.join('\t'), ...[...products, brokenProduct].map((product) => rowOf(header, product))].join('\n')}\n`;
};

export const readOffExportHeader = () =>
  readFileSync(offExportHeaderPath, 'utf8').trim().split('\t');
