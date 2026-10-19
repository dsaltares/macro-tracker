import { createUsdaSource } from '../lib/data/sources/usda/fooddata-central.ts';
import { getLogger } from '../lib/logger.ts';

const bytesPerKibibyte = 1024;
const bytesPerMebibyte = bytesPerKibibyte * bytesPerKibibyte;
const millisecondsPerSecond = 1000;

const run = async () => {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const startedAt = performance.now();
  const portions = { foods: 0, total: 0 };
  let foods = 0;
  for await (const food of createUsdaSource().fetch({
    fetch: globalThis.fetch,
    tempDir: '',
    logger: getLogger('usda'),
    signal: controller.signal,
  })) {
    foods += 1;
    portions.total += food.portions.length;
    portions.foods += food.portions.length > 0 ? 1 : 0;
  }
  const seconds = (performance.now() - startedAt) / millisecondsPerSecond;
  const peakMebibytes =
    (process.resourceUsage().maxRSS * bytesPerKibibyte) / bytesPerMebibyte;
  console.log(
    `${foods} foods, ${portions.foods} with portions (${portions.total} in all), in ${seconds.toFixed(0)} s, peak RSS ${peakMebibytes.toFixed(0)} MiB`,
  );
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
