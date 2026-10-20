import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  docsPageRoute,
  scalarBundlePath,
  scalarConfiguration,
  scalarScriptRoute,
} from './docs.ts';

describe('GET /api/docs', () => {
  it('is a page that renders the OpenAPI document with Scalar', async () => {
    const response = docsPageRoute();
    const html = await response.text();

    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(html).toContain('<title>Macro Tracker API</title>');
    expect(html).toContain('<script src="/api/docs/scalar.js"></script>');
    expect(html).toContain(
      `Scalar.createApiReference('#app', ${JSON.stringify(scalarConfiguration)})`,
    );
  });

  it('points Scalar at the document and keeps it off third parties', () => {
    expect(scalarConfiguration).toEqual({
      url: '/api/v1/openapi.json',
      proxyUrl: '',
      telemetry: false,
      withDefaultFonts: false,
    });
  });
});

describe('GET /api/docs/scalar.js', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/docs/scalar.js', { headers });

  it('serves the Scalar bundle installed in node_modules', async () => {
    const response = await scalarScriptRoute(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(response.headers.get('etag')).toMatch(/^".+"$/);
    const bundle = await readFile(scalarBundlePath);
    const served = Buffer.from(await response.arrayBuffer());
    expect(served.length).toBe(bundle.length);
    expect(served.equals(bundle)).toBe(true);
  });

  it('answers 304 to a browser that already has it', async () => {
    const etag = (await scalarScriptRoute(request())).headers.get('etag');
    if (etag === null) throw new Error('no etag');

    const response = await scalarScriptRoute(
      request({ 'if-none-match': etag }),
    );

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(etag);
    expect(await response.text()).toBe('');
  });
});
