import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { databaseUrl } from '../lib/db/url.ts';
import { envFile } from './production.ts';

const mainCheckout = () =>
  dirname(
    execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8' },
    ).trim(),
  );

const isSymlink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

const setAside = (path: string) => {
  if (isSymlink(path)) {
    rmSync(path);
    return;
  }
  if (existsSync(path)) {
    rmSync(`${path}.before-link`, { recursive: true, force: true });
    renameSync(path, `${path}.before-link`);
    console.log(`Set aside ${path} as ${path}.before-link`);
  }
};

const link = (main: string, path: string) => {
  const target = join(main, path);
  if (!existsSync(target)) {
    throw new Error(`${target} does not exist`);
  }
  setAside(path);
  symlinkSync(target, path);
  console.log(`Linked ${path} -> ${target}`);
};

// The database's top-level directory, so SQLite's -wal and -shm files and
// the backups beside it are shared too; nothing when it is outside the
// checkout, as the linked .env already points every worktree at it.
const databasePath = (main: string) => {
  const url =
    parseEnv(readFileSync(join(main, envFile), 'utf8')).DATABASE_URL ||
    databaseUrl();
  if (isAbsolute(url)) {
    return undefined;
  }
  const path = normalize(url);
  return path.includes(sep) ? path.split(sep)[0] : path;
};

const linkMain = () => {
  const main = mainCheckout();
  if (resolve(main) === resolve(process.cwd())) {
    throw new Error(
      'yarn db:link links a worktree to the main checkout; this is it',
    );
  }
  link(main, envFile);
  const database = databasePath(main);
  if (database) {
    link(main, database);
  }
};

try {
  linkMain();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
