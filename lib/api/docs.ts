import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siteName } from '../brand.ts';
import { openApiDocumentPath } from './routes/openapi.ts';

export const docsPath = '/api/docs';

export const scalarScriptPath = '/api/docs/scalar.js';

export const scalarBundlePath =
  'node_modules/@scalar/api-reference/dist/browser/standalone.js';

export const scalarConfiguration = {
  url: openApiDocumentPath,
  proxyUrl: '',
  telemetry: false,
  withDefaultFonts: false,
};

const inScript = (json: string) => json.replaceAll('<', '\\u003c');

export const docsPage = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${siteName} API</title>
</head>
<body>
<div id="app"></div>
<script src="${scalarScriptPath}"></script>
<script>Scalar.createApiReference('#app', ${inScript(JSON.stringify(scalarConfiguration))})</script>
</body>
</html>
`;

export const docsPageRoute = () =>
  new Response(docsPage(), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });

type Bundle = { body: Uint8Array<ArrayBuffer>; etag: string };

const readBundle = async (): Promise<Bundle> => {
  const body = await readFile(join(process.cwd(), scalarBundlePath));
  const digest = createHash('sha256').update(body).digest('base64url');
  return { body: Uint8Array.from(body), etag: `"${digest}"` };
};

let bundle: Bundle | undefined;

export const scalarScriptRoute = async (request: Request) => {
  bundle ??= await readBundle();
  const headers = {
    etag: bundle.etag,
    'cache-control': 'public, max-age=3600, must-revalidate',
  };
  return request.headers.get('if-none-match') === bundle.etag
    ? new Response(null, { status: 304, headers })
    : new Response(bundle.body, {
        headers: {
          ...headers,
          'content-type': 'text/javascript; charset=utf-8',
        },
      });
};
