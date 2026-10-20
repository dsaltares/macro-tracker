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

export type ApiRoute<
  InputSchema extends z.ZodType,
  ParamsSchema extends z.ZodType,
  Output,
> = {
  scope: ApiKeyScope;
  input?: InputSchema;
  params?: ParamsSchema;
  status?: number;
  handle: (
    call: ApiCall<z.output<InputSchema>, z.output<ParamsSchema>>,
  ) => Promise<Output> | Output;
};

export type RouteParams = Record<string, string | string[] | undefined>;

export type RouteContext = { params: Promise<RouteParams> };

const noParams: RouteContext = { params: Promise.resolve({}) };

const methodsWithoutBody = new Set(['GET', 'HEAD', 'DELETE']);

const queryOf = (url: URL) =>
  Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => {
      const values = url.searchParams.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );

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
    return {
      read: false,
      error: { code: 'INVALID_REQUEST', message: 'The body is not JSON.' },
    };
  }
};

const validate = <Schema extends z.ZodType>(
  schema: Schema | undefined,
  value: unknown,
  message: string,
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
          code: 'INVALID_REQUEST',
          message,
          issues: issuesOf(parsed.error),
        },
      };
};

const insufficientScope = (scope: ApiKeyScope): ApiError => ({
  code: 'INSUFFICIENT_SCOPE',
  message: `This API key does not have the ${scope} scope.`,
});

export const apiHandler =
  <
    InputSchema extends z.ZodType = z.ZodUndefined,
    ParamsSchema extends z.ZodType = z.ZodUndefined,
    Output = unknown,
  >(
    route: ApiRoute<InputSchema, ParamsSchema, Output>,
  ) =>
  (server: ApiServer) =>
  async (request: Request, routeContext: RouteContext = noParams) => {
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
        'The path is not valid.',
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
      const input = validate(
        route.input,
        read.value,
        'The request is not valid.',
      );
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
      return apiErrorResponse({
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side.',
      });
    }
  };
