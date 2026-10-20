import type { ColumnType, Generated } from 'kysely';
import type { BodyMetric } from '../domain/body.ts';
import type { EntryKind, Meal } from '../domain/diary/entries.ts';
import type {
  GenericSource,
  PortionSource,
  Source,
} from '../domain/foods/sources.ts';
import type { NutrientKey } from '../domain/nutrition/nutrients.ts';
import type { ActivityLevel, Sex } from '../domain/profile.ts';

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

export type FoodSourcePreferencesTable = {
  user_id: string;
  source: GenericSource;
  enabled: 0 | 1;
  position: number;
};

type Timestamp = ColumnType<string, string | undefined, string>;

export type UsersTable = {
  id: string;
  name: string;
  email: string;
  email_verified: Generated<0 | 1>;
  image: string | null;
  terms_accepted_at: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type SessionsTable = {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type AccountsTable = {
  id: string;
  user_id: string;
  account_id: string;
  provider_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  scope: string | null;
  password: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type VerificationsTable = {
  id: string;
  identifier: string;
  value: string;
  expires_at: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ProfilesTable = {
  user_id: string;
  sex: Sex;
  birth_date: string;
  height_cm: number;
  activity_level: ActivityLevel;
  created_at: ColumnType<string, string, never>;
  updated_at: string;
};

export type DiaryEntriesTable = {
  id: string;
  user_id: string;
  date: string;
  meal: Meal;
  time: string | null;
  kind: EntryKind;
  food_id: string | null;
  recipe_id: string | null;
  label: string;
  quantity: number | null;
  portion_label: string | null;
  grams: number | null;
  nutrients: string;
  created_at: ColumnType<string, string, never>;
  updated_at: string;
};

export type FavouritesTable = {
  user_id: string;
  food_id: string;
  created_at: string;
};

export type BodyMeasurementsTable = {
  id: string;
  user_id: string;
  date: string;
  metric: BodyMetric;
  value: number;
  created_at: ColumnType<string, string, never>;
};

export type Database = {
  meta: MetaTable;
  foods: FoodsTable;
  food_nutrients: FoodNutrientsTable;
  food_portions: FoodPortionsTable;
  foods_fts: FoodsFtsTable;
  food_imports: FoodImportsTable;
  food_source_preferences: FoodSourcePreferencesTable;
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  profiles: ProfilesTable;
  diary_entries: DiaryEntriesTable;
  favourites: FavouritesTable;
  body_measurements: BodyMeasurementsTable;
};
