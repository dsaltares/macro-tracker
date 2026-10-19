const containerOnly = [
  'NODE_ENV',
  'PORT',
  'HOSTNAME',
  'BACKUP_DIR',
  'DATA_PATH',
];

const scheduledImportsOff = { FOOD_IMPORT_CRON: '', FOOD_DELTA_CRON: '' };

type Environment = Record<string, string | null | undefined>;

export const localEnvironment = (
  production: Environment,
  local: Environment,
  databaseFile: string,
) => {
  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...local, ...production })) {
    if (value != null && !containerOnly.includes(name)) {
      merged[name] = value;
    }
  }
  return { ...merged, ...scheduledImportsOff, DATABASE_URL: databaseFile };
};

const bare = /^[\w./:@,+-]*$/;

const quote = (value: string) => {
  if (bare.test(value)) {
    return value;
  }
  if (!value.includes("'") && !value.includes('\n')) {
    return `'${value}'`;
  }
  return JSON.stringify(value);
};

// Next expands `$NAME` in `.env` whatever the quotes, and Node's `--env-file`, which the `db:*`
// scripts read it with, never does, so no spelling of a `$` means the same to both.
export const formatEnvFile = (environment: Record<string, string>) => {
  const expanded = Object.entries(environment)
    .filter(([, value]) => value.includes('$'))
    .map(([name]) => name);
  if (expanded.length > 0) {
    throw new Error(
      `${expanded.join(', ')} hold a $, which Next and Node would read differently from .env.`,
    );
  }
  return Object.entries(environment)
    .map(([name, value]) => `${name}=${quote(value)}\n`)
    .join('');
};
