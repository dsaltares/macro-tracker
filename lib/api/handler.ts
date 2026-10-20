import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { z } from 'zod';
import type { Database } from '../db/schema.ts';
import type { ApiKeyScope } from '../domain/api-keys.ts';
import type { ServiceContext } from '../services/context.ts';
import { type AuthenticatedApiKey, authenticate } from './authenticate.ts';
import {
  type ApiError,
  apiErrorOf,
  apiErrorResponse,
  issuesOf,
  noStore,
} from './errors.ts';

export const apiMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

export type ApiMethod = (typeof apiMethods)[number];

export type ApiServer = {
  db: Kysely<Database>;
  now: () => string;
  nextId: () => string;
  logger: Logger;
};

export type ApiCall<Input, Params> = {
  context: ServiceContext;
  apiKey: AuthenticatedApiKey;
  input: Input;
  params: Params;
};

export type ApiExample<Input, Params, Output> = {
  params?: Params;
  input?: Input;
  response?: Output;
};

export type ApiEndpoint = {
  method: ApiMethod;
  path: `/${string}`;
  operationId: string;
  summary: string;
  description: string;
  scope: ApiKeyScope;
  input?: z.ZodType;
  params?: z.ZodType;
  output?: z.ZodType;
  status?: number;
  errors?: ApiError[];
  example: ApiExample<unknown, unknown, unknown>;
};

export type ApiRoute<
  InputSchema extends z.ZodType,
  ParamsSchema extends z.ZodType,
  OutputSchema extends z.ZodType,
> = {
  method: ApiMethod;
  path: `/${string}`;
  operationId: string;
  summary: string;
  description: string;
  scope: ApiKeyScope;
  input?: InputSchema;
  params?: ParamsSchema;
  output?: OutputSchema;
  status?: number;
  errors?: ApiError[];
  example: ApiExample<
    z.input<InputSchema>,
    z.input<ParamsSchema>,
    z.output<OutputSchema>
  >;
  handle: (
    call: ApiCall<z.output<InputSchema>, z.output<ParamsSchema>>,
  ) => Promise<z.output<OutputSchema>> | z.output<OutputSchema>;
};

export type ApiRouteHandler = ((
  server: ApiServer,
) => (request: Request, routeContext?: RouteContext) => Promise<Response>) & {
  endpoint: ApiEndpoint;
};

export type RouteParams = Record<string, string | string[] | undefined>;

export type RouteContext = { params: Promise<RouteParams> };

const noParams: RouteContext = { params: Promise.resolve({}) };

export const methodsWithoutBody = new Set(['GET', 'HEAD', 'DELETE']);

const queryOf = (url: URL) =>
  Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => {
      const values = url.searchParams.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );

export const bodyNotJson: ApiError = {
  code: 'INVALID_REQUEST',
  message: 'The body is not JSON.',
};

export const invalidPath: ApiError = {
  code: 'INVALID_REQUEST',
  message: 'The path is not valid.',
};

export const invalidRequest: ApiError = {
  code: 'INVALID_REQUEST',
  message: 'The request is not valid.',
};

export const internalError: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong on our side.',
};

type Read = { read: true; value: unknown } | { read: false; error: ApiError };

const readInput = async (request: Request): Promise<Read> => {
  if (methodsWithoutBody.has(request.method)) {
    return { read: true, value: queryOf(new URL(request.url)) };
  }
  const text = await request.text();
  if (text.trim() === '') {
    return { read: true, value: undefined };
  }
  try {
    return { read: true, value: JSON.parse(text) };
  } catch {
    return { read: false, error: bodyNotJson };
  }
};

const validate = <Schema extends z.ZodType>(
  schema: Schema | undefined,
  value: unknown,
  { message }: ApiError,
):
  | { valid: true; value: z.output<Schema> }
  | { valid: false; error: ApiError } => {
  if (schema === undefined) {
    return { valid: true, value: undefined as z.output<Schema> };
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { valid: true, value: parsed.data }
    : {
        valid: false,
        error: {
          code: invalidRequest.code,
          message,
          issues: issuesOf(parsed.error),
        },
      };
};

export const insufficientScope = (scope: ApiKeyScope): ApiError => ({
  code: 'INSUFFICIENT_SCOPE',
  message: `This API key does not have the ${scope} scope.`,
});

export const apiHandler = <
  InputSchema extends z.ZodType = z.ZodUndefined,
  ParamsSchema extends z.ZodType = z.ZodUndefined,
  OutputSchema extends z.ZodType = z.ZodType,
>(
  route: ApiRoute<InputSchema, ParamsSchema, OutputSchema>,
): ApiRouteHandler =>
  Object.assign(
    (server: ApiServer) =>
      async (request: Request, routeContext: RouteContext = noParams) =>
        serve(route, server, request, routeContext),
    { endpoint: route },
  );

const serve = async <
  InputSchema extends z.ZodType,
  ParamsSchema extends z.ZodType,
  OutputSchema extends z.ZodType,
>(
  route: ApiRoute<InputSchema, ParamsSchema, OutputSchema>,
  server: ApiServer,
  request: Request,
  routeContext: RouteContext,
) => {
  try {
    const authentication = await authenticate(request.headers, server);
    if (!authentication.authenticated) {
      return apiErrorResponse(authentication.error);
    }
    const { apiKey } = authentication;
    if (!apiKey.scopes.includes(route.scope)) {
      return apiErrorResponse(insufficientScope(route.scope));
    }
    const params = validate(
      route.params,
      await routeContext.params,
      invalidPath,
    );
    if (!params.valid) {
      return apiErrorResponse(params.error);
    }
    const read = route.input
      ? await readInput(request)
      : { read: true as const, value: undefined };
    if (!read.read) {
      return apiErrorResponse(read.error);
    }
    const input = validate(route.input, read.value, invalidRequest);
    if (!input.valid) {
      return apiErrorResponse(input.error);
    }
    const output = await route.handle({
      context: {
        db: server.db,
        caller: { userId: apiKey.userId },
        now: server.now,
        nextId: server.nextId,
      },
      apiKey,
      input: input.value,
      params: params.value,
    });
    return output === undefined
      ? new Response(null, { status: 204, headers: noStore })
      : Response.json(output, {
          status: route.status ?? 200,
          headers: noStore,
        });
  } catch (thrown) {
    const error = apiErrorOf(thrown);
    if (error) {
      return apiErrorResponse(error);
    }
    server.logger.error(
      { err: thrown, method: request.method, url: request.url },
      'An API request failed',
    );
    return apiErrorResponse(internalError);
  }
};
