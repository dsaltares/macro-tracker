import { measureRoutes, type RouteSize } from './bundle-size.ts';

const firstLoadBudgetKb = 430;

const bytesPerKb = 1000;

const kb = (bytes: number) => (bytes / bytesPerKb).toFixed(1);

const overBudget = ({ gzipBytes }: RouteSize) =>
  gzipBytes > firstLoadBudgetKb * bytesPerKb;

try {
  const distDir = process.argv[2] ?? process.env.NEXT_DIST_DIR ?? '.next';
  const routes = await measureRoutes(distDir);
  if (routes.length === 0) {
    throw new Error(`No routes in ${distDir}. Run yarn build first.`);
  }
  const width = Math.max(...routes.map(({ route }) => route.length));
  console.log(
    `First-load JS per route, gzipped, against a budget of ${firstLoadBudgetKb} kB\n`,
  );
  for (const route of routes) {
    console.log(
      `${route.route.padEnd(width)}  ${kb(route.gzipBytes).padStart(6)} kB${overBudget(route) ? '  over budget' : ''}`,
    );
  }
  const over = routes.filter(overBudget);
  if (over.length > 0) {
    console.error(
      `\n${over.length} of ${routes.length} routes are over the budget of ${firstLoadBudgetKb} kB.`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
