import { type Kysely, sql } from 'kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('recipes')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('servings', 'real', (col) =>
      col.notNull().check(sql`servings > 0`),
    )
    .addColumn('cooked_weight_g', 'real', (col) =>
      col.check(sql`cooked_weight_g > 0`),
    )
    .addColumn('notes', 'text')
    .addColumn('archived_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createIndex('recipes_user_id_name')
    .on('recipes')
    .columns(['user_id', 'name'])
    .execute();

  await db.schema
    .createTable('recipe_ingredients')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('recipe_id', 'text', (col) =>
      col.notNull().references('recipes.id').onDelete('cascade'),
    )
    .addColumn('food_id', 'text', (col) =>
      col.references('foods.id').onDelete('cascade'),
    )
    .addColumn('child_recipe_id', 'text', (col) =>
      col.references('recipes.id').onDelete('cascade'),
    )
    .addColumn('grams', 'real', (col) => col.notNull().check(sql`grams > 0`))
    .addColumn('portion_label', 'text', (col) => col.notNull())
    .addColumn('quantity', 'real', (col) =>
      col.notNull().check(sql`quantity > 0`),
    )
    .addColumn('position', 'integer', (col) =>
      col.notNull().check(sql`position >= 0`),
    )
    .addCheckConstraint(
      'recipe_ingredients_food_or_recipe',
      sql`(food_id is null) <> (child_recipe_id is null)`,
    )
    .addCheckConstraint(
      'recipe_ingredients_not_itself',
      sql`child_recipe_id is null or child_recipe_id <> recipe_id`,
    )
    .execute();
  await db.schema
    .createIndex('recipe_ingredients_recipe_id_position')
    .on('recipe_ingredients')
    .columns(['recipe_id', 'position'])
    .execute();
  await db.schema
    .createIndex('recipe_ingredients_food_id')
    .on('recipe_ingredients')
    .column('food_id')
    .where(sql.ref('food_id'), 'is not', null)
    .execute();
  await db.schema
    .createIndex('recipe_ingredients_child_recipe_id')
    .on('recipe_ingredients')
    .column('child_recipe_id')
    .where(sql.ref('child_recipe_id'), 'is not', null)
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('recipe_ingredients').execute();
  await db.schema.dropTable('recipes').execute();
};
