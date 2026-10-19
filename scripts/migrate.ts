import { migrateDown, migrateToLatest } from '../lib/db/migrator.ts';
import { databaseUrl } from '../lib/db/url.ts';

const directions = ['up', 'down'] as const;

type Direction = (typeof directions)[number];

const isDirection = (value: string): value is Direction =>
  directions.includes(value as Direction);

const run = async () => {
  const [argument = 'up'] = process.argv.slice(2);
  if (!isDirection(argument)) {
    throw new Error(`Usage: yarn db:migrate [${directions.join('|')}]`);
  }
  console.log(`Migrating ${databaseUrl()} ${argument}`);
  const applied =
    argument === 'up' ? await migrateToLatest() : await migrateDown();
  for (const name of applied) {
    console.log(`  ${argument === 'up' ? '↑' : '↓'} ${name}`);
  }
  console.log(
    applied.length === 0 ? 'Already up to date' : `${applied.length} applied`,
  );
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
