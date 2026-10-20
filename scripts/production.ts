import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { formatEnvFile, localEnvironment } from './local-env.ts';

const configFile = join(homedir(), '.config', 'macro-tracker', 'env');

const defaultSshHost = 'homelab';

export const envFile = '.env';

type Stdout = 'inherit' | 'pipe' | number;

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

export const refuseInProduction = (command: string) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${command} refuses to run with NODE_ENV=production`);
  }
};

export const setAside = (file: string) => {
  rmSync(`${file}.before-copy-down`, { force: true });
  if (existsSync(file)) {
    renameSync(file, `${file}.before-copy-down`);
  }
};

export type Production = {
  host: string;
  service: string;
  onHost: (command: string[], stdout?: Stdout) => string;
  inService: (...command: string[]) => string[];
  close: () => void;
};

export const connectToProduction = (): Production => {
  const host = configured('COPY_DOWN_SSH_HOST') || defaultSshHost;
  const composeDirectory = deployVariable('DEPLOY_COMPOSE_DIR');
  const service = deployVariable('DEPLOY_SERVICE');
  if (!composeDirectory.startsWith('/')) {
    throw new Error('DEPLOY_COMPOSE_DIR must be an absolute path on the host');
  }
  const work = mkdtempSync(join(tmpdir(), 'macro-tracker-copy-down-'));
  // One connection for every call, so the host asks for a password, and Access for a login, once.
  const multiplex = [
    '-o',
    'ControlMaster=auto',
    '-o',
    `ControlPath=${join(work, 'ssh')}`,
    '-o',
    'ControlPersist=60',
  ];
  return {
    host,
    service,
    onHost: (command, stdout = 'inherit') =>
      execFileSync(
        'ssh',
        [
          ...multiplex,
          host,
          `cd ${shellQuote(composeDirectory)} && ${command.map(shellQuote).join(' ')}`,
        ],
        { stdio: ['inherit', stdout, 'inherit'], encoding: 'utf8' },
      ),
    inService: (...command) => [
      'docker',
      'compose',
      'exec',
      '-T',
      service,
      ...command,
    ],
    close: () => {
      try {
        execFileSync('ssh', [...multiplex, '-O', 'exit', host], {
          stdio: 'ignore',
        });
      } catch {}
      rmSync(work, { recursive: true, force: true });
    },
  };
};

export const localEnvFileOf = (
  { onHost, service }: Production,
  databaseFile: string,
) => {
  const compose = JSON.parse(
    onHost(
      ['docker', 'compose', 'config', '--format', 'json', service],
      'pipe',
    ),
  ) as {
    services: Record<string, { environment?: Record<string, string | null> }>;
  };
  const production = compose.services[service]?.environment ?? {};
  const local = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : {};
  return formatEnvFile(localEnvironment(production, local, databaseFile));
};

export const replaceEnvFile = (contents: string) => {
  setAside(envFile);
  writeFileSync(envFile, contents, { mode: 0o600 });
};
