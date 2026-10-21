import {
  APICallError,
  jsonSchema,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from 'ai';
import { z } from 'zod';

export type AiFailure =
  | 'unreadable'
  | 'rejected'
  | 'rate-limited'
  | 'unavailable';

const keywordsStrictOutputsRefuse = ['minLength', 'maxLength'];

export const strictOutput = <T>(name: string, schema: z.ZodType<T>) =>
  Output.object({
    name,
    schema: jsonSchema<T>(
      z.toJSONSchema(schema, {
        override: ({ jsonSchema: node }) => {
          for (const keyword of keywordsStrictOutputsRefuse) {
            delete node[keyword];
          }
          // Strict outputs refuse oneOf, which discriminated unions become; their branches never
          // overlap, so anyOf says the same.
          if (node.oneOf !== undefined) {
            node.anyOf = node.oneOf;
            delete node.oneOf;
          }
        },
      }) as never,
      {
        validate: (value) => {
          const parsed = schema.safeParse(value);
          return parsed.success
            ? { success: true, value: parsed.data }
            : { success: false, error: parsed.error };
        },
      },
    ),
  });

const tooManyRequests = 429;
const firstServerError = 500;

export const failureOf = (error: unknown): AiFailure => {
  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    return 'unreadable';
  }
  if (!APICallError.isInstance(error)) {
    return 'unavailable';
  }
  if (error.statusCode === tooManyRequests) {
    return 'rate-limited';
  }
  return error.statusCode === undefined || error.statusCode >= firstServerError
    ? 'unavailable'
    : 'rejected';
};

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
