import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';
import { apiEndpoints } from './endpoints.ts';
import { apiMethods } from './handler.ts';
import { openApiDocument } from './openapi.ts';
import { openApiDocumentRoute } from './routes/openapi.ts';

const serverUrl = 'http://localhost:3014/api/v1';

const document = openApiDocument(apiEndpoints, { serverUrl });

const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
  Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
);

const routeHandlersDir = fileURLToPath(
  new URL('../../app/api/v1/', import.meta.url),
);

const notEndpoints = new Set(['openapi.json']);

const isCatchAll = (segment: string) => segment.startsWith('[...');

const openApiPath = (routeDir: string) =>
  `/${routeDir
    .split(sep)
    .map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}'))
    .join('/')}`;

const wiredRoutes = async () => {
  const files = await readdir(routeHandlersDir, { recursive: true });
  const routes: string[] = [];
  for (const file of files.filter((name) => name.endsWith('route.ts'))) {
    const routeDir = relative(routeHandlersDir, join(routeHandlersDir, file))
      .split(sep)
      .slice(0, -1);
    if (
      routeDir.some(isCatchAll) ||
      routeDir.some((s) => notEndpoints.has(s))
    ) {
      continue;
    }
    const module: Record<string, unknown> = await import(
      pathToFileURL(join(routeHandlersDir, file)).href
    );
    for (const method of apiMethods.filter((m) => m in module)) {
      routes.push(`${method} ${openApiPath(routeDir.join(sep))}`);
    }
  }
  return routes.sort();
};

const walk = (
  value: unknown,
  visit: (node: Record<string, unknown>) => void,
) => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value !== null && typeof value === 'object') {
    visit(value as Record<string, unknown>);
    for (const inner of Object.values(value)) walk(inner, visit);
  }
};

describe('the OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await new Validator().validate(
      JSON.parse(JSON.stringify(document)),
    );

    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('describes every route handler under /api/v1, and nothing else', async () => {
    expect(operations.toSorted()).toEqual(await wiredRoutes());
  });

  it('gives every operation a summary, a description, its tag and its scope', () => {
    const tagNames = new Set(document.tags.map(({ name }) => name));
    for (const methods of Object.values(document.paths)) {
      for (const operation of Object.values(methods) as {
        summary: string;
        description: string;
        tags: string[];
      }[]) {
        expect(operation.summary).not.toBe('');
        expect(operation.description).toMatch(
          /Needs a key with the `(read|write)` scope\./,
        );
        expect(operation.tags.every((tag) => tagNames.has(tag))).toBe(true);
      }
    }
  });

  it('carries an example of every request body, path parameter and response', () => {
    for (const endpoint of apiEndpoints) {
      const { input, params, output, example } = endpoint;
      if (params) {
        expect(example.params, endpoint.operationId).toBeDefined();
      }
      if (input && endpoint.method !== 'GET') {
        expect(example.input, endpoint.operationId).toBeDefined();
      }
      if (output) {
        expect(example.response, endpoint.operationId).toBeDefined();
      }
    }
  });

  it('has examples its own schemas accept', () => {
    for (const {
      operationId,
      input,
      params,
      output,
      example,
    } of apiEndpoints) {
      if (input && example.input !== undefined) {
        expect(input.safeParse(example.input), operationId).toMatchObject({
          success: true,
        });
      }
      if (params && example.params !== undefined) {
        expect(params.safeParse(example.params), operationId).toMatchObject({
          success: true,
        });
      }
      if (output && example.response !== undefined) {
        expect(output.safeParse(example.response), operationId).toMatchObject({
          success: true,
        });
      }
    }
  });

  it('answers 204 for a route without an output', () => {
    const remove = document.paths['/diary/entries/{id}']?.delete as {
      responses: Record<string, unknown>;
    };

    expect(Object.keys(remove.responses)).toContain('204');
    expect(Object.keys(remove.responses)).not.toContain('200');
  });

  it('lists the errors every endpoint shares and the ones of its own', () => {
    const food = document.paths['/foods/{id}']?.get as {
      responses: Record<string, { description: string }>;
    };

    expect(Object.keys(food.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '500',
    ]);
    expect(food.responses['401']?.description).toContain('`MISSING_API_KEY`');
    expect(food.responses['401']?.description).toContain('`REVOKED_API_KEY`');
    expect(food.responses['403']?.description).toContain('the read scope');
    expect(food.responses['404']?.description).toBe(
      '`NOT_FOUND`: There is no food with this id.',
    );
  });

  it('shares the schemas under components and refers to them from there', () => {
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        'Error',
        'NutrientVector',
        'CanonicalNutrients',
        'Food',
        'FoodSummary',
        'Portion',
        'DiaryEntry',
        'DiaryDay',
        'Measurement',
        'GoalSettings',
        'Goal',
        'RecipeSummary',
        'Recipe',
        'Ingredient',
        'TrendDay',
      ]),
    );
    const refs: string[] = [];
    walk(document, (node) => {
      if (typeof node.$ref === 'string') refs.push(node.$ref);
      expect(node).not.toHaveProperty('$defs');
      expect(node).not.toHaveProperty('$schema');
    });
    for (const ref of refs) {
      const id = ref.replace('#/components/schemas/', '');
      expect(ref).toBe(`#/components/schemas/${id}`);
      expect(document.components.schemas).toHaveProperty(id);
    }
  });

  it('documents the bearer key as the one security scheme', () => {
    expect(document.security).toEqual([{ apiKey: [] }]);
    expect(document.components.securitySchemes.apiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(document.servers).toEqual([{ url: serverUrl }]);
  });

  it('refuses two endpoints on one method and path', () => {
    const [me] = apiEndpoints;
    if (!me) throw new Error('no endpoints');

    expect(() => openApiDocument([me, me], { serverUrl })).toThrow(
      'GET /me is defined twice',
    );
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('serves the document for the configured base URL, cacheable', async () => {
    const response = openApiDocumentRoute();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await response.json()).toMatchObject({
      openapi: '3.1.0',
      servers: [{ url: 'http://localhost:3014/api/v1' }],
    });
  });
});
