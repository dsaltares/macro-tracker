import { type ExpressionBuilder, type Kysely, sql } from 'kysely';
import { normaliseBarcode } from '../domain/foods/barcode.ts';
import {
  defaultPortion,
  type Portion,
  withStandardPortions,
} from '../domain/foods/portions.ts';
import {
  lowerCaseTerms,
  matchExpression,
  nameHoldsEveryWordExpression,
  nameStartsWithExpression,
  searchPageSize,
} from '../domain/foods/search.ts';
import type {
  PortionSource,
  ReferenceSource,
  Source,
} from '../domain/foods/sources.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import { getLogger } from '../logger.ts';
import { nutrientsOf, nutrientVector } from './foods.ts';
import type { Database } from './schema.ts';

export type FoodReader = {
  db: Kysely<Database>;
  userId: string | null;
};

export type FoodSummary = {
  id: string;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  source: Source;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  defaultPortion: Portion;
};

export type FoodWithLastLoggedAmount = FoodSummary & {
  portion: Portion;
  quantity: number;
};

export type LastLoggedAmount = {
  foodId: string;
  portionLabel: string | null;
  quantity: number | null;
};

export type FoodSearchPage = {
  foods: FoodSummary[];
  nextCursor: number | null;
};

export type StoredPortion = Portion & {
  id: string;
  source: PortionSource;
};

export type Food = {
  id: string;
  source: Source;
  barcode: string | null;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  archived: boolean;
  nutrients: NutrientVector;
  portions: (StoredPortion | Portion)[];
};

const nameWeight = 4;
const brandWeight = 1;

const wordSeparators = [',', '.', '-', '(', ')', '/', '&', "'", '"', ';', ':'];

const spacedWords = wordSeparators.reduce(
  (words, separator) => sql`replace(${words}, ${separator}, ' ')`,
  sql`lower(foods.name)`,
);

const nameWords = sql`' ' || replace(replace(${spacedWords}, '  ', ' '), '  ', ' ') || ' '`;

const wholeWord = (words: readonly string[]) => ` ${words.join(' ')} `;

const matchTier = (terms: readonly string[]) =>
  sql`case
    when ${nameWords} = ${wholeWord(terms)} then 0
    when instr(${nameWords}, ${wholeWord(terms)}) = 1 then 1
    when ${sql.join(
      terms.map((term) => sql`instr(${nameWords}, ${wholeWord([term])}) > 0`),
      sql` and `,
    )} then 2
    else 3
  end`;

// The unary plus keeps SQLite off foods_owner_user_id: past a handful of ids it would walk every
// reference food through that index rather than look each id up by its key.
const ownerUserId = sql<string | null>`+${sql.ref('foods.owner_user_id')}`;

const visibleFoods =
  (userId: string | null) =>
  ({ eb, or }: ExpressionBuilder<Database, 'foods'>) =>
    userId === null
      ? eb(ownerUserId, 'is', null)
      : or([eb(ownerUserId, 'is', null), eb(ownerUserId, '=', userId)]);

const visiblePortions =
  (userId: string | null) =>
  ({ eb, or }: ExpressionBuilder<Database, 'food_portions'>) =>
    userId === null
      ? eb('source', '=', 'upstream')
      : or([eb('source', '=', 'upstream'), eb('user_id', '=', userId)]);

export const portionsQuery = (
  db: Kysely<Database>,
  userId: string | null,
  foodIds: readonly string[],
) =>
  db
    .selectFrom('food_portions')
    .select(['id', 'food_id', 'label', 'grams', 'source'])
    .where('food_id', 'in', foodIds)
    .where(visiblePortions(userId))
    .orderBy('food_id')
    .orderBy('position')
    .orderBy('source');

const portionsByFood = async (
  { db, userId }: FoodReader,
  foodIds: readonly string[],
) => {
  const byFood = new Map<string, StoredPortion[]>();
  if (foodIds.length === 0) {
    return byFood;
  }
  for (const { food_id, ...portion } of await portionsQuery(
    db,
    userId,
    foodIds,
  ).execute()) {
    byFood.set(food_id, [...(byFood.get(food_id) ?? []), portion]);
  }
  return byFood;
};

const summaryColumns = [
  'foods.id',
  'foods.name',
  'foods.brand',
  'foods.quantity_label',
  'foods.source',
  'food_nutrients.energy_kcal',
  'food_nutrients.protein',
  'food_nutrients.carbohydrate',
  'food_nutrients.fat',
] as const;

type SummaryRow = {
  id: string;
  name: string;
  brand: string | null;
  quantity_label: string | null;
  source: Source;
  energy_kcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

type SearchMatch = { match: string; terms: readonly string[] };

export const searchMatch = (query: string): SearchMatch | null => {
  const match = matchExpression(query);
  return match === null ? null : { match, terms: lowerCaseTerms(query) };
};

const inFoodsFts = (match: string) =>
  sql<boolean>`foods_fts.rowid in (select rowid from foods_fts where foods_fts match ${match})`;

// matchTier, from the full-text index: a short prefix matches hundreds of thousands of foods,
// and working out the name's words of each of them took seconds.
const ftsMatchTier = (terms: readonly string[]) =>
  sql`case
    when ${inFoodsFts(nameStartsWithExpression(terms))} then (
      case when (
        select ${nameWords} from foods where foods.rowid = foods_fts.rowid
      ) = ${wholeWord(terms)} then 0 else 1 end
    )
    when ${inFoodsFts(nameHoldsEveryWordExpression(terms))} then 2
    else 3
  end`;

// The few foods search never shows (archived, other users', disabled sources), so ranking
// a match reads the full-text index alone rather than every matching food's row.
const hiddenFoods = (db: Kysely<Database>, userId: string | null) => {
  const archived = db
    .selectFrom('foods')
    .select('foods.rowid')
    .where('foods.archived_at', 'is not', null);
  const othersFoods = db
    .selectFrom('foods')
    .select('foods.rowid')
    .where('foods.owner_user_id', 'is not', null);
  if (userId === null) {
    return archived.unionAll(othersFoods);
  }
  return archived
    .unionAll(othersFoods.where('foods.owner_user_id', '!=', userId))
    .unionAll(
      db
        .selectFrom('foods')
        .select('foods.rowid')
        .where('foods.archived_at', 'is', null)
        .where('foods.source', 'in', (eb) =>
          eb
            .selectFrom('food_source_preferences')
            .select('food_source_preferences.source')
            .where('food_source_preferences.user_id', '=', userId)
            .where('food_source_preferences.enabled', '=', 0),
        ),
    );
};

const notOwnFood = (db: Kysely<Database>, userId: string | null) =>
  userId === null
    ? sql<number>`1`
    : sql<number>`foods_fts.rowid not in (${db
        .selectFrom('foods')
        .select('foods.rowid')
        .where('foods.owner_user_id', '=', userId)})`;

export const searchQuery = (
  db: Kysely<Database>,
  userId: string | null,
  { match, terms }: SearchMatch,
  offset: number,
) => {
  const ranked = db
    .selectFrom('foods_fts')
    .select([
      'foods_fts.rowid',
      notOwnFood(db, userId).as('not_own'),
      ftsMatchTier(terms).as('tier'),
      sql<number>`bm25(foods_fts, ${nameWeight}, ${brandWeight}, ${nameWeight})`.as(
        'score',
      ),
    ])
    .where(sql<boolean>`foods_fts match ${match}`)
    .where('foods_fts.rowid', 'not in', hiddenFoods(db, userId))
    .orderBy('not_own')
    .orderBy('tier')
    .orderBy('score')
    .orderBy('foods_fts.rowid')
    .limit(searchPageSize + 1)
    .offset(offset);
  // The page alone is joined to its foods and nutrients, in the order it was ranked in.
  return db
    .selectFrom(ranked.as('ranked'))
    .innerJoin('foods', 'foods.rowid', 'ranked.rowid')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .select(summaryColumns)
    .orderBy('ranked.not_own')
    .orderBy('ranked.tier')
    .orderBy('ranked.score')
    .orderBy('ranked.rowid');
};

export const userFoodsQuery = (
  db: Kysely<Database>,
  userId: string,
  search: SearchMatch | null,
  offset: number,
) => {
  const own = db
    .selectFrom('foods')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .select(summaryColumns)
    .where('foods.owner_user_id', '=', userId)
    .where('foods.archived_at', 'is', null);
  const ordered =
    search === null
      ? own.orderBy(sql`foods.name collate nocase`)
      : own
          .innerJoin('foods_fts', 'foods_fts.rowid', 'foods.rowid')
          .where(sql<boolean>`foods_fts match ${search.match}`)
          .orderBy(matchTier(search.terms))
          .orderBy(
            sql`bm25(foods_fts, ${nameWeight}, ${brandWeight}, ${nameWeight})`,
          );
  return ordered
    .orderBy('foods.rowid')
    .limit(searchPageSize + 1)
    .offset(offset);
};

const labelAndGrams = ({ label, grams }: Portion): Portion => ({
  label,
  grams,
});

const summaryOf = (
  row: SummaryRow,
  portions: readonly Portion[],
): FoodSummary => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  quantityLabel: row.quantity_label,
  source: row.source,
  energyKcal: row.energy_kcal,
  protein: row.protein,
  carbohydrate: row.carbohydrate,
  fat: row.fat,
  defaultPortion: labelAndGrams(defaultPortion(portions)),
});

export const foodSummariesQuery = (
  db: Kysely<Database>,
  userId: string | null,
  foodIds: readonly string[],
) =>
  db
    .selectFrom('foods')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .select(summaryColumns)
    .where('foods.id', 'in', foodIds)
    .where(visibleFoods(userId));

export const foodNutrientsQuery = (
  db: Kysely<Database>,
  userId: string | null,
  foodIds: readonly string[],
) =>
  db
    .selectFrom('foods')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .selectAll('food_nutrients')
    .where('foods.id', 'in', foodIds)
    .where(visibleFoods(userId));

export const nutrientsByFood = async (
  { db, userId }: FoodReader,
  foodIds: readonly string[],
): Promise<Map<string, NutrientVector>> => {
  if (foodIds.length === 0) {
    return new Map();
  }
  const rows = await foodNutrientsQuery(db, userId, foodIds).execute();
  return new Map(rows.map((row) => [row.food_id, nutrientVector(row)]));
};

const lastLoggedAmount = (
  portions: readonly Portion[],
  { portionLabel, quantity }: LastLoggedAmount,
) => {
  const portion = withStandardPortions(portions).find(
    ({ label }) => label === portionLabel,
  );
  return portion === undefined || quantity === null
    ? { portion: labelAndGrams(defaultPortion(portions)), quantity: 1 }
    : { portion: labelAndGrams(portion), quantity };
};

export const withLastLoggedAmounts = async (
  reader: FoodReader,
  amounts: readonly LastLoggedAmount[],
): Promise<FoodWithLastLoggedAmount[]> => {
  if (amounts.length === 0) {
    return [];
  }
  const foodIds = amounts.map(({ foodId }) => foodId);
  const [rows, portions] = await Promise.all([
    foodSummariesQuery(reader.db, reader.userId, foodIds).execute(),
    portionsByFood(reader, foodIds),
  ]);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return amounts.flatMap((amount) => {
    const row = rowsById.get(amount.foodId);
    if (row === undefined) {
      return [];
    }
    const foodPortions = portions.get(row.id) ?? [];
    return [
      {
        ...summaryOf(row, foodPortions),
        ...lastLoggedAmount(foodPortions, amount),
      },
    ];
  });
};

const searchPage = async (
  reader: FoodReader,
  rows: readonly SummaryRow[],
  cursor: number,
): Promise<FoodSearchPage> => {
  const page = rows.slice(0, searchPageSize);
  const portions = await portionsByFood(
    reader,
    page.map(({ id }) => id),
  );
  return {
    foods: page.map((row) => summaryOf(row, portions.get(row.id) ?? [])),
    nextCursor: rows.length > searchPageSize ? cursor + searchPageSize : null,
  };
};

const logger = getLogger('food-search');

const toTenthOfAMillisecond = (ms: number) => Math.round(ms * 10) / 10;

const timed = async <Row>(
  match: string | null,
  cursor: number,
  run: () => Promise<Row[]>,
) => {
  const started = performance.now();
  const rows = await run();
  logger.debug(
    {
      match,
      cursor,
      rows: rows.length,
      ms: toTenthOfAMillisecond(performance.now() - started),
    },
    'food search',
  );
  return rows;
};

export const searchFoods = async (
  reader: FoodReader,
  { query, cursor }: { query: string; cursor: number },
): Promise<FoodSearchPage> => {
  const search = searchMatch(query);
  if (search === null) {
    return { foods: [], nextCursor: null };
  }
  const rows = await timed(search.match, cursor, () =>
    searchQuery(reader.db, reader.userId, search, cursor).execute(),
  );
  return searchPage(reader, rows, cursor);
};

export const listUserFoods = async (
  db: Kysely<Database>,
  userId: string,
  { query, cursor }: { query: string; cursor: number },
): Promise<FoodSearchPage> => {
  const search = searchMatch(query);
  const rows = await timed(search?.match ?? null, cursor, () =>
    userFoodsQuery(db, userId, search, cursor).execute(),
  );
  return searchPage({ db, userId }, rows, cursor);
};

const foodColumns = [
  'foods.id',
  'foods.source',
  'foods.barcode',
  'foods.name',
  'foods.brand',
  'foods.quantity_label',
  'foods.archived_at',
] as const;

export const foodByIdQuery = (
  db: Kysely<Database>,
  userId: string | null,
  id: string,
) =>
  db
    .selectFrom('foods')
    .select(foodColumns)
    .where('foods.id', '=', id)
    .where(visibleFoods(userId));

export const foodByBarcodeQuery = (
  db: Kysely<Database>,
  userId: string | null,
  barcode: string,
) =>
  db
    .selectFrom('foods')
    .select(foodColumns)
    .where('foods.barcode', '=', barcode)
    .where(({ eb, and, or }) =>
      userId === null
        ? and([
            eb('foods.owner_user_id', 'is', null),
            eb('foods.archived_at', 'is', null),
          ])
        : and([
            eb('foods.archived_at', 'is', null),
            or([
              eb('foods.owner_user_id', 'is', null),
              eb('foods.owner_user_id', '=', userId),
            ]),
          ]),
    )
    .orderBy(sql`foods.owner_user_id is null`)
    .orderBy('foods.rowid', 'desc')
    .limit(1);

export const foodBySourceIdQuery = (
  db: Kysely<Database>,
  source: ReferenceSource,
  sourceId: string,
) =>
  db
    .selectFrom('foods')
    .select(foodColumns)
    .where('foods.source', '=', source)
    .where('foods.source_id', '=', sourceId)
    .where('foods.owner_user_id', 'is', null)
    .where('foods.archived_at', 'is', null)
    .limit(1);

type FoodRow = {
  id: string;
  source: Source;
  barcode: string | null;
  name: string;
  brand: string | null;
  quantity_label: string | null;
  archived_at: string | null;
};

const fullFood = async (reader: FoodReader, row: FoodRow): Promise<Food> => {
  const [nutrients, portions] = await Promise.all([
    nutrientsOf(reader.db, row.id),
    portionsByFood(reader, [row.id]),
  ]);
  return {
    id: row.id,
    source: row.source,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    quantityLabel: row.quantity_label,
    archived: row.archived_at !== null,
    nutrients: nutrients ?? {},
    portions: withStandardPortions(portions.get(row.id) ?? []),
  };
};

export const findFood = async (
  reader: FoodReader,
  id: string,
): Promise<Food | null> => {
  const row = await foodByIdQuery(
    reader.db,
    reader.userId,
    id,
  ).executeTakeFirst();
  return row ? fullFood(reader, row) : null;
};

export const findFoodByBarcode = async (
  reader: FoodReader,
  code: string,
): Promise<Food | null> => {
  const barcode = normaliseBarcode(code);
  if (barcode === null) {
    return null;
  }
  const row = await foodByBarcodeQuery(
    reader.db,
    reader.userId,
    barcode,
  ).executeTakeFirst();
  return row ? fullFood(reader, row) : null;
};

export const findFoodBySourceId = async (
  reader: FoodReader,
  source: ReferenceSource,
  sourceId: string,
): Promise<Food | null> => {
  const row = await foodBySourceIdQuery(
    reader.db,
    source,
    sourceId,
  ).executeTakeFirst();
  return row ? fullFood(reader, row) : null;
};
