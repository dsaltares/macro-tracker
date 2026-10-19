import { type Kysely, sql } from 'kysely';

const nutrientColumns = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
  'fibre',
  'alcohol',
  'water',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'omega_3',
  'omega_6',
  'cholesterol',
  'sugars',
  'added_sugars',
  'starch',
  'polyols',
  'sodium',
  'potassium',
  'chloride',
  'calcium',
  'phosphorus',
  'magnesium',
  'iron',
  'zinc',
  'copper',
  'manganese',
  'fluoride',
  'selenium',
  'chromium',
  'molybdenum',
  'iodine',
  'vitamin_a',
  'vitamin_d',
  'vitamin_e',
  'vitamin_k',
  'vitamin_c',
  'thiamin',
  'riboflavin',
  'niacin',
  'vitamin_b6',
  'folate',
  'vitamin_b12',
  'biotin',
  'pantothenic_acid',
  'choline',
  'caffeine',
];

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('foods')
    // VACUUM may renumber an implicit rowid, and foods_fts finds its rows by rowid.
    .addColumn('rowid', 'integer', (col) => col.primaryKey())
    .addColumn('id', 'text', (col) => col.notNull().unique())
    .addColumn('source', 'text', (col) =>
      col
        .notNull()
        .check(sql`source in ('off', 'ciqual', 'cofid', 'usda', 'user')`),
    )
    .addColumn('source_id', 'text')
    .addColumn('barcode', 'text')
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('brand', 'text')
    .addColumn('quantity_label', 'text')
    .addColumn('owner_user_id', 'text')
    .addColumn('archived_at', 'text')
    .addColumn('fetched_live_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addCheckConstraint(
      'foods_user_food_has_owner_not_source_id',
      sql`(source = 'user') = (owner_user_id is not null)
        and (source = 'user') = (source_id is null)`,
    )
    .execute();

  await db.schema
    .createIndex('foods_source_source_id')
    .unique()
    .on('foods')
    .columns(['source', 'source_id'])
    .execute();
  await db.schema
    .createIndex('foods_barcode')
    .on('foods')
    .column('barcode')
    .execute();
  await db.schema
    .createIndex('foods_owner_user_id')
    .on('foods')
    .column('owner_user_id')
    .execute();

  await nutrientColumns
    .reduce(
      (table, column) => table.addColumn(column, 'real'),
      db.schema
        .createTable('food_nutrients')
        .addColumn('food_id', 'text', (col) =>
          col.primaryKey().references('foods.id').onDelete('cascade'),
        ),
    )
    .execute();

  await db.schema
    .createTable('food_portions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('food_id', 'text', (col) =>
      col.notNull().references('foods.id').onDelete('cascade'),
    )
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('grams', 'real', (col) => col.notNull().check(sql`grams > 0`))
    .addColumn('source', 'text', (col) =>
      col.notNull().check(sql`source in ('upstream', 'user')`),
    )
    .addColumn('user_id', 'text')
    .addColumn('position', 'integer', (col) => col.notNull())
    .addCheckConstraint(
      'food_portions_user_portion_has_user',
      sql`(source = 'user') = (user_id is not null)`,
    )
    .execute();
  await db.schema
    .createIndex('food_portions_food_id_position')
    .on('food_portions')
    .columns(['food_id', 'position'])
    .execute();
  await db.schema
    .createIndex('food_portions_upstream_label')
    .unique()
    .on('food_portions')
    .columns(['food_id', 'label'])
    .where(sql.ref('source'), '=', 'upstream')
    .execute();

  await sql`
    create virtual table foods_fts using fts5(
      name,
      brand,
      content = 'foods',
      content_rowid = 'rowid',
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3'
    )
  `.execute(db);
  await sql`
    create trigger foods_fts_after_insert after insert on foods begin
      insert into foods_fts (rowid, name, brand)
      values (new.rowid, new.name, new.brand);
    end
  `.execute(db);
  await sql`
    create trigger foods_fts_after_delete after delete on foods begin
      insert into foods_fts (foods_fts, rowid, name, brand)
      values ('delete', old.rowid, old.name, old.brand);
    end
  `.execute(db);
  await sql`
    create trigger foods_fts_after_update after update of name, brand on foods
    when old.name is not new.name or old.brand is not new.brand begin
      insert into foods_fts (foods_fts, rowid, name, brand)
      values ('delete', old.rowid, old.name, old.brand);
      insert into foods_fts (rowid, name, brand)
      values (new.rowid, new.name, new.brand);
    end
  `.execute(db);
};

export const down = async (db: Kysely<unknown>) => {
  await sql`drop trigger foods_fts_after_update`.execute(db);
  await sql`drop trigger foods_fts_after_delete`.execute(db);
  await sql`drop trigger foods_fts_after_insert`.execute(db);
  await sql`drop table foods_fts`.execute(db);
  await db.schema.dropTable('food_portions').execute();
  await db.schema.dropTable('food_nutrients').execute();
  await db.schema.dropTable('foods').execute();
};
