import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const clientManifestName = 'page_client-reference-manifest.js';

type ClientManifest = { entryJSFiles?: Record<string, readonly string[]> };

export type RouteSize = { route: string; files: number; gzipBytes: number };

export const routeOf = (manifestPath: string) => {
  const segments = manifestPath
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join('/')}`;
};

export const entryFilesOf = (manifestSource: string) => {
  const context: Record<string, unknown> = {};
  context.globalThis = context;
  runInNewContext(manifestSource, context);
  const manifests = Object.values(
    (context.__RSC_MANIFEST ?? {}) as Record<string, ClientManifest>,
  );
  return [
    ...new Set(
      manifests.flatMap(({ entryJSFiles = {} }) =>
        Object.values(entryJSFiles).flat(),
      ),
    ),
  ];
};

const findManifests = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name === clientManifestName)
    .map((entry) => join(entry.parentPath, entry.name));
};

export const measureRoutes = async (distDir: string): Promise<RouteSize[]> => {
  const buildManifest = JSON.parse(
    await readFile(join(distDir, 'build-manifest.json'), 'utf8'),
  ) as { rootMainFiles: readonly string[] };
  const gzipSizes = new Map<string, number>();
  const gzipSizeOf = async (file: string) => {
    const known = gzipSizes.get(file);
    if (known !== undefined) {
      return known;
    }
    const size = gzipSync(await readFile(join(distDir, file))).length;
    gzipSizes.set(file, size);
    return size;
  };

  const appDir = join(distDir, 'server', 'app');
  const routes = await Promise.all(
    (await findManifests(appDir)).map(async (manifestPath) => {
      const files = [
        ...new Set([
          ...buildManifest.rootMainFiles,
          ...entryFilesOf(await readFile(manifestPath, 'utf8')),
        ]),
      ];
      const sizes = await Promise.all(files.map(gzipSizeOf));
      return {
        route: routeOf(relative(appDir, manifestPath)),
        files: files.length,
        gzipBytes: sizes.reduce((total, size) => total + size, 0),
      };
    }),
  );
  return routes.sort((a, b) => a.route.localeCompare(b.route));
};
