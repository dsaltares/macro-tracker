import { authBaseUrl } from '../../auth/base-url.ts';
import { apiEndpoints } from '../endpoints.ts';
import { type OpenApiDocument, openApiDocument } from '../openapi.ts';

export const openApiDocumentPath = '/api/v1/openapi.json';

let document: OpenApiDocument | undefined;

export const openApiDocumentRoute = () => {
  document ??= openApiDocument(apiEndpoints, {
    serverUrl: `${authBaseUrl()}/api/v1`,
  });
  return Response.json(document, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
};
