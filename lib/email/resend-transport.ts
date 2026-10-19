import { z } from 'zod';
import type { EmailFailure, SendEmail } from './transport.ts';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type ResendTransportOptions = {
  apiKey: string;
  from: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export const resendBaseUrl = 'https://api.resend.com';

const sentSchema = z.object({ id: z.string().min(1) });

const errorSchema = z.object({ message: z.string().min(1) });

const tooManyRequests = 429;

const failureForStatus = (status: number): EmailFailure => {
  if (status === tooManyRequests) {
    return 'rate-limited';
  }
  return status >= 500 ? 'unavailable' : 'rejected';
};

const readBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const describeResponse = (response: Response, body: unknown) => {
  const parsed = errorSchema.safeParse(body);
  const detail = parsed.success ? `: ${parsed.data.message}` : '';
  return `Resend responded ${response.status} ${response.statusText}${detail}`;
};

export const createResendTransport = ({
  apiKey,
  from,
  baseUrl = resendBaseUrl,
  fetchImpl = (url, init) => fetch(url, init),
}: ResendTransportOptions): SendEmail => {
  return async ({ to, subject, html, text }) => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
    } catch (error) {
      return {
        delivered: false,
        failure: 'unavailable',
        message: `Resend could not be reached: ${describeError(error)}`,
      };
    }

    const body = await readBody(response);
    if (!response.ok) {
      return {
        delivered: false,
        failure: failureForStatus(response.status),
        message: describeResponse(response, body),
      };
    }

    const sent = sentSchema.safeParse(body);
    if (!sent.success) {
      return {
        delivered: false,
        failure: 'unavailable',
        message: 'Resend accepted the message without returning an id',
      };
    }
    return { delivered: true, id: sent.data.id };
  };
};
