import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenFoodFactsSource } from '../lib/data/sources/open-food-facts/export.ts';
import { getLogger } from '../lib/logger.ts';

const bytesPerKibibyte = 1024;
const bytesPerMebibyte = bytesPerKibibyte * bytesPerKibibyte;
const millisecondsPerSecond = 1000;

const run = async () => {
  const [url] = process.argv.slice(2);
  const source = createOpenFoodFactsSource(url ? { url } : {});
  const tempDir = await mkdtemp(join(tmpdir(), 'macro-tracker-off-'));
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const startedAt = performance.now();
  let foods = 0;
  try {
    for await (const _food of source.fetch({
      fetch: globalThis.fetch,
      tempDir,
      logger: getLogger('open-food-facts'),
      signal: controller.signal,
      lastSucceededAt: null,
    })) {
      foods += 1;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  const seconds = (performance.now() - startedAt) / millisecondsPerSecond;
  const peakMebibytes =
    (process.resourceUsage().maxRSS * bytesPerKibibyte) / bytesPerMebibyte;
  console.log(
    `${foods} foods in ${seconds.toFixed(0)} s, peak RSS ${peakMebibytes.toFixed(0)} MiB`,
  );
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
