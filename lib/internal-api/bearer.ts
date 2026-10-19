import { createHash, timingSafeEqual } from 'node:crypto';

const bearerPrefix = 'Bearer ';

const digest = (value: string) => createHash('sha256').update(value).digest();

export const carriesBearerToken = (
  request: Request,
  token: string | undefined,
) => {
  const authorization = request.headers.get('authorization');
  if (!token || !authorization?.startsWith(bearerPrefix)) {
    return false;
  }
  return timingSafeEqual(
    digest(authorization.slice(bearerPrefix.length)),
    digest(token),
  );
};
