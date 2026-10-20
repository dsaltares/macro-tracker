import { databaseUrl } from '../lib/db/url.ts';
import {
  connectToProduction,
  envFile,
  localEnvFileOf,
  refuseInProduction,
  replaceEnvFile,
} from './production.ts';

const copyDownEnv = async () => {
  refuseInProduction('yarn env:copy-down');
  const production = connectToProduction();
  try {
    console.log(
      `Reading the environment of ${production.service} on ${production.host}`,
    );
    replaceEnvFile(localEnvFileOf(production, databaseUrl()));
    console.log(
      `Copied production's environment into ${envFile}; what it replaced is beside it as ${envFile}.before-copy-down`,
    );
  } finally {
    production.close();
  }
};

copyDownEnv().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
