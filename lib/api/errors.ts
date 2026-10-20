import type { z } from 'zod';

const apiErrorStatuses = {
  MISSING_API_KEY: 401,
  INVALID_API_KEY: 401,
  REVOKED_API_KEY: 401,
  INSUFFICIENT_SCOPE: 403,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

export type ApiErrorCode = keyof typeof apiErrorStatuses;

export type ApiIssue = { path: (string | number)[]; message: string };

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  issues?: ApiIssue[];
};

type ThrownApiError = Error & { apiError: ApiError };

export const apiError = (code: ApiErrorCode, message: string): ThrownApiError =>
  Object.assign(new Error(message), { apiError: { code, message } });

export const apiErrorOf = (thrown: unknown): ApiError | null =>
  thrown instanceof Error && 'apiError' in thrown
    ? (thrown as ThrownApiError).apiError
    : null;

export const issuesOf = (error: z.ZodError): ApiIssue[] =>
  error.issues.map(({ path, message }) => ({
    path: path.map((segment) =>
      typeof segment === 'number' ? segment : String(segment),
    ),
    message,
  }));

export const noStore = { 'cache-control': 'no-store' };

const bearerChallenge = { 'www-authenticate': 'Bearer' };

export const apiErrorResponse = ({ code, message, issues }: ApiError) => {
  const status = apiErrorStatuses[code];
  return Response.json(
    { error: { code, message, ...(issues ? { issues } : {}) } },
    {
      status,
      headers: status === 401 ? { ...noStore, ...bearerChallenge } : noStore,
    },
  );
};
