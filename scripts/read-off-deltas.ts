import { createOpenFoodFactsDeltasSource } from '../lib/data/sources/open-food-facts/deltas.ts';
import { getLogger } from '../lib/logger.ts';

const bytesPerKibibyte = 1024;
const bytesPerMebibyte = bytesPerKibibyte * bytesPerKibibyte;
const millisecondsPerSecond = 1000;

const run = async () => {
  const [since] = process.argv.slice(2);
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const startedAt = performance.now();
  let foods = 0;
  for await (const _food of createOpenFoodFactsDeltasSource().fetch({
    fetch: globalThis.fetch,
    tempDir: '',
    logger: getLogger('open-food-facts'),
    signal: controller.signal,
    lastSucceededAt: since ? new Date(since).toISOString() : null,
  })) {
    foods += 1;
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
