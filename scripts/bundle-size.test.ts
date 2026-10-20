import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryFilesOf, measureRoutes, routeOf } from './bundle-size.ts';

const clientManifest = (
  page: string,
  entryJSFiles: Record<string, readonly string[]>,
) =>
  `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST[${JSON.stringify(page)}] = ${JSON.stringify({ entryJSFiles })};`;

const chunks = {
  'static/chunks/main.js': 'const main = "the framework";'.repeat(40),
  'static/chunks/layout.js': 'const layout = "the app shell";'.repeat(20),
  'static/chunks/diary.js': 'const diary = "the day view";'.repeat(10),
};

const gzipBytes = (file: keyof typeof chunks) => gzipSync(chunks[file]).length;

let distDir: string;

const write = async (path: string, contents: string) => {
  await mkdir(dirname(join(distDir, path)), { recursive: true });
  await writeFile(join(distDir, path), contents);
};

beforeEach(async () => {
  distDir = await mkdtemp(join(tmpdir(), 'macro-tracker-bundle-size-'));
});

afterEach(async () => {
  await rm(distDir, { recursive: true, force: true });
});

describe('routeOf', () => {
  it('drops route groups and the manifest’s name', () => {
    expect(
      routeOf(join('(app)', 'diary', 'page_client-reference-manifest.js')),
    ).toBe('/diary');
    expect(
      routeOf(
        join('(app)', 'foods', '[id]', 'page_client-reference-manifest.js'),
      ),
    ).toBe('/foods/[id]');
    expect(routeOf('page_client-reference-manifest.js')).toBe('/');
  });
});

describe('entryFilesOf', () => {
  it('lists every entry’s chunks once', () => {
    expect(
      entryFilesOf(
        clientManifest('/(app)/diary/page', {
          '[project]/app/layout': ['static/chunks/layout.js'],
          '[project]/app/(app)/diary/page': [
            'static/chunks/layout.js',
            'static/chunks/diary.js',
          ],
        }),
      ),
    ).toEqual(['static/chunks/layout.js', 'static/chunks/diary.js']);
  });
});

describe('measureRoutes', () => {
  it('sums the gzipped root and entry chunks of each route, counting a shared chunk once', async () => {
    await write(
      'build-manifest.json',
      JSON.stringify({ rootMainFiles: ['static/chunks/main.js'] }),
    );
    for (const [file, contents] of Object.entries(chunks)) {
      await write(file, contents);
    }
    await write(
      'server/app/(app)/diary/page_client-reference-manifest.js',
      clientManifest('/(app)/diary/page', {
        '[project]/app/layout': ['static/chunks/layout.js'],
        '[project]/app/(app)/diary/page': [
          'static/chunks/layout.js',
          'static/chunks/diary.js',
        ],
      }),
    );
    await write(
      'server/app/page_client-reference-manifest.js',
      clientManifest('/page', {
        '[project]/app/page': ['static/chunks/main.js'],
      }),
    );

    expect(await measureRoutes(distDir)).toEqual([
      { route: '/', files: 1, gzipBytes: gzipBytes('static/chunks/main.js') },
      {
        route: '/diary',
        files: 3,
        gzipBytes:
          gzipBytes('static/chunks/main.js') +
          gzipBytes('static/chunks/layout.js') +
          gzipBytes('static/chunks/diary.js'),
      },
    ]);
  });
});
