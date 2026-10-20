import { z } from 'zod';
import { siteName } from '../brand.ts';
import { invalidApiKey, missingApiKey, revokedApiKey } from './authenticate.ts';
import { type ApiError, apiErrorStatuses } from './errors.ts';
import {
  type ApiEndpoint,
  bodyNotJson,
  insufficientScope,
  internalError,
  invalidPath,
  invalidRequest,
  methodsWithoutBody,
} from './handler.ts';
import { errorEnvelope } from './schemas.ts';

type JsonSchema = Record<string, unknown>;

type Components = Record<string, JsonSchema>;

const defsPrefix = '#/$defs/';
const componentsPrefix = '#/components/schemas/';

const withComponentRefs = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withComponentRefs);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === '$ref' &&
      typeof inner === 'string' &&
      inner.startsWith(defsPrefix)
        ? `${componentsPrefix}${inner.slice(defsPrefix.length)}`
        : withComponentRefs(inner),
    ]),
  );
};

const collect = (components: Components, defs: Record<string, unknown>) => {
  for (const [id, def] of Object.entries(defs)) {
    const schema = withComponentRefs(def) as JsonSchema;
    const existing = components[id];
    if (existing && JSON.stringify(existing) !== JSON.stringify(schema)) {
      throw new Error(`Two different schemas carry the id ${id}`);
    }
    components[id] = schema;
  }
};

const jsonSchemaOf = (
  schema: z.ZodType,
  io: 'input' | 'output',
  components: Components,
): JsonSchema => {
  const { $schema, $defs, ...rest } = z.toJSONSchema(schema, {
    io,
    target: 'draft-2020-12',
    unrepresentable: 'any',
  });
  collect(components, $defs ?? {});
  return withComponentRefs(rest) as JsonSchema;
};

export const tags = {
  me: {
    name: 'Account',
    description: 'The account behind the key, and the key itself.',
  },
  foods: {
    name: 'Foods',
    description:
      'Reference foods and the caller’s own, each with its nutrients per 100 g and the portions it is logged in.',
  },
  diary: {
    name: 'Diary',
    description:
      'What was eaten, by day and meal. An entry keeps the nutrients it was logged with.',
  },
  measurements: {
    name: 'Body',
    description: 'The weight log, which a derived goal follows.',
  },
  goals: {
    name: 'Goals',
    description: 'The goal settings and the goal they give on a day.',
  },
  recipes: {
    name: 'Recipes',
    description: 'The caller’s recipes, with their ingredients and nutrients.',
  },
  trends: {
    name: 'Trends',
    description: 'Totals, rolling averages and adherence over a range of days.',
  },
} satisfies Record<string, { name: string; description: string }>;

const tagOf = (path: string) => {
  const segment = path.split('/')[1] ?? '';
  const tag = (tags as Record<string, { name: string; description: string }>)[
    segment
  ];
  if (!tag) {
    throw new Error(`There is no tag for the path ${path}`);
  }
  return tag;
};

const exampleIssue = { path: ['date'], message: 'Not a date' };

const errorExample = (error: ApiError) => ({
  error:
    error === invalidRequest || error === invalidPath
      ? { ...error, issues: [exampleIssue] }
      : { code: error.code, message: error.message },
});

const errorsOf = (endpoint: ApiEndpoint): ApiError[] => [
  missingApiKey,
  invalidApiKey,
  revokedApiKey,
  insufficientScope(endpoint.scope),
  ...(endpoint.params ? [invalidPath] : []),
  ...(endpoint.input
    ? [
        invalidRequest,
        ...(methodsWithoutBody.has(endpoint.method) ? [] : [bodyNotJson]),
      ]
    : []),
  ...(endpoint.errors ?? []),
  internalError,
];

const errorResponses = (endpoint: ApiEndpoint, errorSchema: JsonSchema) => {
  const byStatus = new Map<number, ApiError[]>();
  for (const error of errorsOf(endpoint)) {
    const status = apiErrorStatuses[error.code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), error]);
  }
  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([a], [b]) => a - b)
      .map(([status, errors]) => [
        String(status),
        {
          description: errors
            .map(({ code, message }) => `\`${code}\`: ${message}`)
            .join('\n\n'),
          content: {
            'application/json': {
              schema: errorSchema,
              example: errorExample(errors[0] as ApiError),
            },
          },
        },
      ]),
  );
};

const successResponse = (endpoint: ApiEndpoint, components: Components) =>
  endpoint.output
    ? {
        [String(endpoint.status ?? 200)]: {
          description: endpoint.status === 201 ? 'Created' : 'OK',
          content: {
            'application/json': {
              schema: jsonSchemaOf(endpoint.output, 'output', components),
              ...(endpoint.example.response === undefined
                ? {}
                : { example: endpoint.example.response }),
            },
          },
        },
      }
    : { '204': { description: 'Done, with no body.' } };

const parametersOf = (
  location: 'path' | 'query',
  schema: z.ZodType | undefined,
  example: unknown,
  components: Components,
) => {
  if (!schema) {
    return [];
  }
  const json = jsonSchemaOf(schema, 'input', components);
  const properties = json.properties as Record<string, JsonSchema> | undefined;
  if (!properties) {
    throw new Error(`The ${location} parameters are not an object schema`);
  }
  const required = new Set((json.required as string[] | undefined) ?? []);
  const examples = (example ?? {}) as Record<string, unknown>;
  return Object.entries(properties).map(
    ([name, { description, ...parameterSchema }]) => ({
      name,
      in: location,
      required: location === 'path' || required.has(name),
      ...(description === undefined ? {} : { description }),
      schema: parameterSchema,
      ...(examples[name] === undefined ? {} : { example: examples[name] }),
    }),
  );
};

const requestBodyOf = (endpoint: ApiEndpoint, components: Components) =>
  endpoint.input && !methodsWithoutBody.has(endpoint.method)
    ? {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: jsonSchemaOf(endpoint.input, 'input', components),
              ...(endpoint.example.input === undefined
                ? {}
                : { example: endpoint.example.input }),
            },
          },
        },
      }
    : {};

const operationOf = (
  endpoint: ApiEndpoint,
  errorSchema: JsonSchema,
  components: Components,
) => {
  const parameters = [
    ...parametersOf(
      'path',
      endpoint.params,
      endpoint.example.params,
      components,
    ),
    ...(methodsWithoutBody.has(endpoint.method)
      ? parametersOf(
          'query',
          endpoint.input,
          endpoint.example.input,
          components,
        )
      : []),
  ];
  return {
    operationId: endpoint.operationId,
    summary: endpoint.summary,
    description: `${endpoint.description}\n\nNeeds a key with the \`${endpoint.scope}\` scope.`,
    tags: [tagOf(endpoint.path).name],
    ...(parameters.length === 0 ? {} : { parameters }),
    ...requestBodyOf(endpoint, components),
    responses: {
      ...successResponse(endpoint, components),
      ...errorResponses(endpoint, errorSchema),
    },
  };
};

const overview = `Log food, read the diary and follow goals from a script, a shortcut or an agent, with an API key.

**Authentication.** Create a key in the app under *Settings › API keys*, choosing its scopes: \`read\` for every GET, \`write\` for everything else; \`write\` does not include \`read\`. The key is shown once. Send it on every request as \`Authorization: Bearer mt_…\`.

**Errors.** Every error is \`{ "error": { "code", "message", "issues"? } }\` with a 4xx or 5xx status. The codes each endpoint can answer are listed under it.

**Pages.** A list answers \`{ "items", "nextCursor" }\`. Send \`nextCursor\` back as \`?cursor=\` for the next page, until it is null.

**Dates and units.** A date is the user's local day as \`YYYY-MM-DD\`; a time is \`HH:MM\`. Nutrients are keyed by canonical name, energy in kcal and the rest in g, mg or µg, as the NutrientVector schema lists.`;

export const openApiDocument = (
  endpoints: readonly ApiEndpoint[],
  { serverUrl }: { serverUrl: string },
) => {
  const components: Components = {};
  const errorSchema = jsonSchemaOf(errorEnvelope, 'output', components);
  const paths: Record<string, Record<string, unknown>> = {};
  const operationIds = new Set<string>();
  for (const endpoint of endpoints) {
    const method = endpoint.method.toLowerCase();
    const path = paths[endpoint.path] ?? {};
    paths[endpoint.path] = path;
    if (method in path) {
      throw new Error(`${endpoint.method} ${endpoint.path} is defined twice`);
    }
    if (operationIds.has(endpoint.operationId)) {
      throw new Error(`The operationId ${endpoint.operationId} is used twice`);
    }
    operationIds.add(endpoint.operationId);
    path[method] = operationOf(endpoint, errorSchema, components);
  }
  const usedTags = new Set(endpoints.map(({ path }) => tagOf(path).name));
  return {
    openapi: '3.1.0',
    info: {
      title: `${siteName} API`,
      version: '1',
      description: overview,
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    tags: Object.values(tags).filter(({ name }) => usedTags.has(name)),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An API key from Settings › API keys, sent as Authorization: Bearer <key>.',
        },
      },
      schemas: components,
    },
  };
};

export type OpenApiDocument = ReturnType<typeof openApiDocument>;
