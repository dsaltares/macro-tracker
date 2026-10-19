import type { ColumnType, Generated } from 'kysely';
import type { PortionSource, Source } from '../domain/foods/sources.ts';
import type { NutrientKey } from '../domain/nutrition/nutrients.ts';

export type MetaTable = {
  key: string;
  value: string;
};

export type FoodsTable = {
  rowid: Generated<number>;
  id: string;
  source: Source;
  source_id: string | null;
  barcode: string | null;
  name: string;
  original_name: string | null;
  brand: string | null;
  quantity_label: string | null;
  owner_user_id: string | null;
  archived_at: string | null;
  fetched_live_at: string | null;
  created_at: ColumnType<string, string, never>;
  updated_at: string;
};

export type FoodNutrientsTable = { food_id: string } & Record<
  NutrientKey,
  number | null
>;

export type FoodPortionsTable = {
  id: string;
  food_id: string;
  label: string;
  grams: number;
  source: PortionSource;
  user_id: string | null;
  position: number;
};

export type FoodsFtsTable = {
  rowid: number;
  name: string;
  brand: string | null;
  original_name: string | null;
};

export const foodImportStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
] as const;

export type FoodImportStatus = (typeof foodImportStatuses)[number];

export type FoodImportsTable = {
  id: string;
  sources: string;
  status: FoodImportStatus;
  started_at: string | null;
  finished_at: string | null;
  inserted: Generated<number>;
  updated: Generated<number>;
  archived: Generated<number>;
  error: string | null;
};

export type Database = {
  meta: MetaTable;
  foods: FoodsTable;
  food_nutrients: FoodNutrientsTable;
  food_portions: FoodPortionsTable;
  foods_fts: FoodsFtsTable;
  food_imports: FoodImportsTable;
};
