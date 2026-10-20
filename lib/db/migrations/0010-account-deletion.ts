import { type Kysely, sql } from 'kysely';

const createPreferences = (db: Kysely<unknown>, owned: boolean) =>
  db.schema
    .createTable('food_source_preferences_next')
    .addColumn('user_id', 'text', (col) =>
      owned
        ? col.notNull().references('users.id').onDelete('cascade')
        : col.notNull(),
    )
    .addColumn('source', 'text', (col) =>
      col.notNull().check(sql`source in ('ciqual', 'cofid', 'usda')`),
    )
    .addColumn('enabled', 'integer', (col) =>
      col.notNull().check(sql`enabled in (0, 1)`),
    )
    .addColumn('position', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('food_source_preferences_pk', [
      'user_id',
      'source',
    ])
    .execute();

const rebuildPreferences = async (db: Kysely<unknown>, owned: boolean) => {
  await createPreferences(db, owned);
  await sql`
    insert into food_source_preferences_next (user_id, source, enabled, position)
    select user_id, source, enabled, position from food_source_preferences
    where user_id in (select id from users)
  `.execute(db);
  await db.schema.dropTable('food_source_preferences').execute();
  await db.schema
    .alterTable('food_source_preferences_next')
    .renameTo('food_source_preferences')
    .execute();
};

export const up = async (db: Kysely<unknown>) => {
  await rebuildPreferences(db, true);
  await db.schema
    .createIndex('food_portions_user_id')
    .on('food_portions')
    .column('user_id')
    .where(sql.ref('user_id'), 'is not', null)
    .execute();
  // SQLite cannot add a foreign key to a column in place, and rebuilding foods would copy every
  // reference food, so the foods and portions a user owns go with them through a trigger.
  await sql`
    create trigger users_delete_owned_foods after delete on users begin
      delete from food_portions where user_id = old.id;
      delete from foods where owner_user_id = old.id;
    end
  `.execute(db);
};

export const down = async (db: Kysely<unknown>) => {
  await sql`drop trigger users_delete_owned_foods`.execute(db);
  await db.schema.dropIndex('food_portions_user_id').execute();
  await rebuildPreferences(db, false);
};
