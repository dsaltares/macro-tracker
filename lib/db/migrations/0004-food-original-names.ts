import { type Kysely, sql } from 'kysely';

const dropSearch = async (db: Kysely<unknown>) => {
  await sql`drop trigger foods_fts_after_update`.execute(db);
  await sql`drop trigger foods_fts_after_delete`.execute(db);
  await sql`drop trigger foods_fts_after_insert`.execute(db);
  await sql`drop table foods_fts`.execute(db);
};

const createSearch = async (db: Kysely<unknown>, columns: string[]) => {
  const indexed = sql.raw(columns.join(', '));
  const added = sql.raw(columns.map((column) => `new.${column}`).join(', '));
  const removed = sql.raw(columns.map((column) => `old.${column}`).join(', '));
  const changed = sql.raw(
    columns.map((column) => `old.${column} is not new.${column}`).join(' or '),
  );
  await sql`
    create virtual table foods_fts using fts5(
      ${indexed},
      content = 'foods',
      content_rowid = 'rowid',
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3'
    )
  `.execute(db);
  await sql`
    create trigger foods_fts_after_insert after insert on foods begin
      insert into foods_fts (rowid, ${indexed})
      values (new.rowid, ${added});
    end
  `.execute(db);
  await sql`
    create trigger foods_fts_after_delete after delete on foods begin
      insert into foods_fts (foods_fts, rowid, ${indexed})
      values ('delete', old.rowid, ${removed});
    end
  `.execute(db);
  await sql`
    create trigger foods_fts_after_update after update of ${indexed} on foods
    when ${changed} begin
      insert into foods_fts (foods_fts, rowid, ${indexed})
      values ('delete', old.rowid, ${removed});
      insert into foods_fts (rowid, ${indexed})
      values (new.rowid, ${added});
    end
  `.execute(db);
  await sql`insert into foods_fts (foods_fts) values ('rebuild')`.execute(db);
};

export const up = async (db: Kysely<unknown>) => {
  await dropSearch(db);
  await db.schema
    .alterTable('foods')
    .addColumn('original_name', 'text')
    .execute();
  await createSearch(db, ['name', 'brand', 'original_name']);
};

export const down = async (db: Kysely<unknown>) => {
  await dropSearch(db);
  await db.schema.alterTable('foods').dropColumn('original_name').execute();
  await createSearch(db, ['name', 'brand']);
};
