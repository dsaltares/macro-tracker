import { randomBytes } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { databaseUrl } from '../lib/db/url.ts';
import {
  connectToProduction,
  envFile,
  localEnvFileOf,
  refuseInProduction,
  replaceEnvFile,
  setAside,
} from './production.ts';

const sidecars = ['', '-wal', '-shm'];

const sqliteHeader = 'SQLite format 3\0';

const copyDown = async () => {
  refuseInProduction('yarn db:copy-down');
  const production = connectToProduction();
  const { host, service, onHost, inService } = production;
  const target = databaseUrl();
  const copyName = `copy-down-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const copyDownBackupDirectory = `/data/${copyName}`;
  const copy = `${target}.copy-down`;
  mkdirSync(dirname(target), { recursive: true });
  try {
    console.log(`Backing up ${service} on ${host}`);
    try {
      onHost([
        'docker',
        'compose',
        'exec',
        '-T',
        '-e',
        `BACKUP_DIR=${copyDownBackupDirectory}`,
        service,
        'node',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        'scripts/backup-database.ts',
      ]);
      const file = openSync(copy, 'w');
      try {
        onHost(
          inService('sh', '-c', `cat ${copyDownBackupDirectory}/db-*.sqlite`),
          file,
        );
      } finally {
        closeSync(file);
      }
    } finally {
      try {
        onHost(inService('rm', '-rf', copyDownBackupDirectory));
      } catch {
        console.error(
          `Could not remove ${copyDownBackupDirectory} from ${service} on ${host}; remove it by hand.`,
        );
      }
    }
    if (
      readFileSync(copy).subarray(0, 16).toString('latin1') !== sqliteHeader
    ) {
      throw new Error(`What came back from ${host} is not a SQLite database.`);
    }
    const environment = localEnvFileOf(production, target);

    for (const suffix of sidecars) {
      setAside(`${target}${suffix}`);
    }
    renameSync(copy, target);
    replaceEnvFile(environment);
    console.log(
      `Copied production into ${target} and ${envFile}; what they replaced is beside them as *.before-copy-down`,
    );
  } finally {
    production.close();
    rmSync(copy, { force: true });
  }
};

copyDown().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
