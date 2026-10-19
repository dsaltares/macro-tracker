import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { databaseUrl } from '../lib/db/url.ts';
import { formatEnvFile, localEnvironment } from './local-env.ts';

const configFile = join(homedir(), '.config', 'macro-tracker', 'env');

const defaultSshHost = 'homelab';

const sidecars = ['', '-wal', '-shm'];

const envFile = '.env';

const sqliteHeader = 'SQLite format 3\0';

const configured = (name: string) => {
  if (process.env[name]) {
    return process.env[name];
  }
  try {
    return parseEnv(readFileSync(configFile, 'utf8'))[name];
  } catch {
    return undefined;
  }
};

const deployVariable = (name: string) =>
  configured(name) ||
  execFileSync('gh', ['variable', 'get', name], { encoding: 'utf8' }).trim();

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

const setAside = (file: string) => {
  rmSync(`${file}.before-copy-down`, { force: true });
  if (existsSync(file)) {
    renameSync(file, `${file}.before-copy-down`);
  }
};

const copyDown = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'yarn db:copy-down refuses to run with NODE_ENV=production',
    );
  }
  const host = configured('COPY_DOWN_SSH_HOST') || defaultSshHost;
  const composeDirectory = deployVariable('DEPLOY_COMPOSE_DIR');
  const service = deployVariable('DEPLOY_SERVICE');
  if (!composeDirectory.startsWith('/')) {
    throw new Error('DEPLOY_COMPOSE_DIR must be an absolute path on the host');
  }
  const target = databaseUrl();
  const copyName = `copy-down-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const copyDownBackupDirectory = `/data/${copyName}`;
  const work = mkdtempSync(join(tmpdir(), 'macro-tracker-copy-down-'));
  const copy = `${target}.copy-down`;
  mkdirSync(dirname(target), { recursive: true });
  // One connection for every call, so the host asks for a password, and Access for a login, once.
  const multiplex = [
    '-o',
    'ControlMaster=auto',
    '-o',
    `ControlPath=${join(work, 'ssh')}`,
    '-o',
    'ControlPersist=60',
  ];
  const onHost = (
    command: string[],
    stdout: 'inherit' | 'pipe' | number = 'inherit',
  ) =>
    execFileSync(
      'ssh',
      [
        ...multiplex,
        host,
        `cd ${shellQuote(composeDirectory)} && ${command.map(shellQuote).join(' ')}`,
      ],
      { stdio: ['inherit', stdout, 'inherit'], encoding: 'utf8' },
    );
  const inService = (...command: string[]) => [
    'docker',
    'compose',
    'exec',
    '-T',
    service,
    ...command,
  ];
  try {
    console.log(`Backing up ${service} on ${host}`);
    let composeConfig: string;
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
      composeConfig = onHost(
        ['docker', 'compose', 'config', '--format', 'json', service],
        'pipe',
      );
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

    const compose = JSON.parse(composeConfig) as {
      services: Record<string, { environment?: Record<string, string | null> }>;
    };
    const production = compose.services[service]?.environment ?? {};
    const local = existsSync(envFile)
      ? parseEnv(readFileSync(envFile, 'utf8'))
      : {};
    const environment = formatEnvFile(
      localEnvironment(production, local, target),
    );

    for (const suffix of sidecars) {
      setAside(`${target}${suffix}`);
    }
    renameSync(copy, target);
    setAside(envFile);
    writeFileSync(envFile, environment, { mode: 0o600 });
    console.log(
      `Copied production into ${target} and ${envFile}; what they replaced is beside them as *.before-copy-down`,
    );
  } finally {
    try {
      execFileSync('ssh', [...multiplex, '-O', 'exit', host], {
        stdio: 'ignore',
      });
    } catch {}
    rmSync(copy, { force: true });
    rmSync(work, { recursive: true, force: true });
  }
};

copyDown().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
