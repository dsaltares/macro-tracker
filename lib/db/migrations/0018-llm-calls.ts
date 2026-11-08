import { type Kysely, sql } from 'kysely';

// One row per model call: a step of a meal estimate's tool loop, or a label reading, so what
// each feature costs can be read back, run by run.
export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('llm_calls')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('run_id', 'text', (col) => col.notNull())
    .addColumn('user_id', 'text', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('purpose', 'text', (col) =>
      col
        .notNull()
        .check(
          sql`purpose in ('meal-estimate', 'meal-revision', 'meal-repair', 'label-reading')`,
        ),
    )
    .addColumn('step', 'integer', (col) => col.notNull())
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('input_tokens', 'integer')
    .addColumn('cached_input_tokens', 'integer')
    .addColumn('output_tokens', 'integer')
    .addColumn('reasoning_tokens', 'integer')
    .addColumn('cost_usd', 'real')
    .addColumn('finish_reason', 'text')
    .addColumn('response', 'text')
    .addColumn('reasoning', 'text')
    .addColumn('tool_calls', 'text', (col) =>
      col.check(sql`tool_calls is null or json_valid(tool_calls)`),
    )
    .addColumn('error', 'text')
    .addColumn('duration_ms', 'integer')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createIndex('llm_calls_run_id')
    .on('llm_calls')
    .columns(['run_id', 'step'])
    .execute();
  await db.schema
    .createIndex('llm_calls_created_at')
    .on('llm_calls')
    .column('created_at')
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('llm_calls').execute();
};
