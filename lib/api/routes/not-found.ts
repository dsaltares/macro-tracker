import { apiErrorResponse } from '../errors.ts';

export const notFoundRoute = () =>
  apiErrorResponse({
    code: 'NOT_FOUND',
    message: 'There is no such endpoint in /api/v1.',
  });
