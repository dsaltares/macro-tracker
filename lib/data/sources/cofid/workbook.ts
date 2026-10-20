import { readSheet, type SheetData } from 'read-excel-file/node';
import type { DeclaredAmount } from '../../../domain/foods/source-food.ts';
import type { FoodSource } from '../types.ts';
import {
  type CofidFood,
  type CofidValues,
  cofidSheets,
  sourceFoodFromCofid,
} from './mapping.ts';

export const cofidWorkbookUrl =
  'https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx';

export type WorkbookCounts = {
  bytes: number;
  rows: number;
  duplicates: number;
  rejected: number;
  foods: number;
};

const codeColumn = 0;
const nameColumn = 1;
const firstNutrientColumn = 7;
const columnCodesRow = 1;
const firstFoodRow = 3;

type CellValue = SheetData[number][number] | undefined;

const textOf = (cell: CellValue) =>
  typeof cell === 'string' || typeof cell === 'number'
    ? String(cell).trim()
    : '';

const declaredOf = (cell: CellValue): DeclaredAmount =>
  typeof cell === 'number' || typeof cell === 'string' ? cell : undefined;

type SheetRow = { name: string; values: CofidValues };

const rowsByCode = (data: SheetData) => {
  const columns = (data[columnCodesRow] ?? []).map(textOf);
  const rows = new Map<string, SheetRow>();
  for (const row of data.slice(firstFoodRow)) {
    const code = textOf(row[codeColumn]);
    if (code === '' || rows.has(code)) {
      continue;
    }
    const values: Record<string, DeclaredAmount> = {};
    columns.forEach((column, at) => {
      if (at >= firstNutrientColumn && column !== '') {
        values[column] = declaredOf(row[at]);
      }
    });
    rows.set(code, { name: textOf(row[nameColumn]), values });
  }
  return rows;
};

const foodCodes = (data: SheetData) =>
  data
    .slice(firstFoodRow)
    .map((row) => textOf(row[codeColumn]))
    .filter((code) => code !== '');

const isoFromHttpDate = (date: string | null) => {
  const time = date === null ? Number.NaN : Date.parse(date);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

export const createCofidSource = ({
  url = cofidWorkbookUrl,
}: {
  url?: string;
} = {}): FoodSource => ({
  id: 'cofid',
  kind: 'full',
  emits: ['cofid'],
  async *fetch({ fetch, logger, signal }) {
    const startedAt = performance.now();
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}`);
    }
    const workbook = Buffer.from(await response.arrayBuffer());
    const lastModified = isoFromHttpDate(response.headers.get('last-modified'));
    const sheetData = await Promise.all(
      cofidSheets.map((sheet) => readSheet(workbook, sheet)),
    );
    const sheets = sheetData.map(rowsByCode);
    const counts: WorkbookCounts = {
      bytes: workbook.byteLength,
      rows: 0,
      duplicates: 0,
      rejected: 0,
      foods: 0,
    };
    const seen = new Set<string>();
    for (const code of foodCodes(sheetData[0] ?? [])) {
      counts.rows += 1;
      if (seen.has(code)) {
        counts.duplicates += 1;
        logger.warn(
          { code },
          'skipped a food whose code CoFID gives to an earlier food',
        );
        continue;
      }
      seen.add(code);
      const rows = sheets.flatMap((sheet) => sheet.get(code) ?? []);
      const food: CofidFood = {
        code,
        name: rows[0]?.name ?? '',
        values: Object.assign({}, ...rows.map(({ values }) => values)),
        lastModified,
      };
      const mapped = sourceFoodFromCofid(food);
      if (!mapped.success) {
        counts.rejected += 1;
        logger.debug({ reason: mapped.reason }, 'rejected a CoFID food');
        continue;
      }
      counts.foods += 1;
      yield mapped.food;
    }
    logger.info(
      { ...counts, ms: Math.round(performance.now() - startedAt) },
      'read the CoFID workbook',
    );
  },
});
