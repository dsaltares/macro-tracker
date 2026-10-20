import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('diary_entries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('date', 'text', (col) =>
      col
        .notNull()
        .check(sql`date glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
    )
    .addColumn('meal', 'text', (col) =>
      col
        .notNull()
        .check(sql`meal in ('breakfast', 'lunch', 'dinner', 'snack')`),
    )
    .addColumn('time', 'text', (col) =>
      col.check(sql`time glob '[0-2][0-9]:[0-5][0-9]'`),
    )
    .addColumn('kind', 'text', (col) =>
      col.notNull().check(sql`kind in ('food', 'recipe', 'quick')`),
    )
    .addColumn('food_id', 'text', (col) =>
      col.references('foods.id').onDelete('set null'),
    )
    .addColumn('recipe_id', 'text')
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('quantity', 'real', (col) => col.check(sql`quantity > 0`))
    .addColumn('portion_label', 'text')
    .addColumn('grams', 'real', (col) => col.check(sql`grams > 0`))
    .addColumn('nutrients', 'text', (col) =>
      col
        .notNull()
        .check(sql`json_valid(nutrients) and json_type(nutrients) = 'object'`),
    )
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addCheckConstraint(
      'diary_entries_links_match_kind',
      sql`(kind = 'food' or food_id is null)
        and (kind = 'recipe' or recipe_id is null)`,
    )
    .addCheckConstraint(
      'diary_entries_only_quick_entries_have_no_amount',
      sql`(kind = 'quick') = (quantity is null)
        and (kind = 'quick') = (portion_label is null)
        and (kind = 'quick') = (grams is null)`,
    )
    .execute();
  await db.schema
    .createIndex('diary_entries_user_id_date')
    .on('diary_entries')
    .columns(['user_id', 'date'])
    .execute();
  await db.schema
    .createIndex('diary_entries_food_id')
    .on('diary_entries')
    .column('food_id')
    .execute();

  await db.schema
    .createTable('favourites')
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('food_id', 'text', (col) =>
      col.notNull().references('foods.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('favourites_pk', ['user_id', 'food_id'])
    .execute();
  await db.schema
    .createIndex('favourites_food_id')
    .on('favourites')
    .column('food_id')
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('favourites').execute();
  await db.schema.dropTable('diary_entries').execute();
};
