import { describe, expect, it, vi } from 'vitest';
import {
  createResendTransport,
  type FetchLike,
  resendBaseUrl,
} from './resend-transport.ts';
import type { EmailMessage } from './transport.ts';

const json = (bodyInit: unknown, status = 200) =>
  new Response(JSON.stringify(bodyInit), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json' },
  });

const message: EmailMessage = {
  to: 'eater@example.test',
  subject: 'Reset your password',
  html: '<p>Reset</p>',
  text: 'Reset',
};

const transportWith = (fetchImpl: FetchLike) =>
  createResendTransport({
    apiKey: 'test-key',
    from: 'Macro Tracker <noreply@example.test>',
    baseUrl: 'https://resend.example.test',
    fetchImpl,
  });

describe('createResendTransport', () => {
  it('posts the message to the Resend API and returns its id', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ id: 'msg_1' })),
    );

    await expect(transportWith(fetchImpl)(message)).resolves.toEqual({
      delivered: true,
      id: 'msg_1',
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://resend.example.test/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Macro Tracker <noreply@example.test>',
      to: 'eater@example.test',
      subject: 'Reset your password',
      html: '<p>Reset</p>',
      text: 'Reset',
    });
  });

  it('defaults to the public Resend API', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ id: 'msg_1' })),
    );
    const transport = createResendTransport({
      apiKey: 'test-key',
      from: 'noreply@example.test',
      fetchImpl,
    });

    await transport(message);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${resendBaseUrl}/emails`,
      expect.anything(),
    );
  });

  it('reports a quota or rate limit response as rate-limited', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ message: 'Daily quota exceeded' }, 429)),
    );

    await expect(transportWith(fetchImpl)(message)).resolves.toEqual({
      delivered: false,
      failure: 'rate-limited',
      message: expect.stringContaining('Daily quota exceeded'),
    });
  });

  it('reports a rejected message with the reason Resend gave', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ message: 'The domain is not verified' }, 403)),
    );

    await expect(transportWith(fetchImpl)(message)).resolves.toEqual({
      delivered: false,
      failure: 'rejected',
      message: 'Resend responded 403 Error: The domain is not verified',
    });
  });

  it('reports a server error as unavailable', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(json({}, 503)));

    await expect(transportWith(fetchImpl)(message)).resolves.toMatchObject({
      delivered: false,
      failure: 'unavailable',
    });
  });

  it('reports a network failure as unavailable', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.reject(new Error('socket hang up')),
    );

    await expect(transportWith(fetchImpl)(message)).resolves.toEqual({
      delivered: false,
      failure: 'unavailable',
      message: 'Resend could not be reached: socket hang up',
    });
  });

  it('does not claim delivery when the response carries no id', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(json({ ok: true })),
    );

    await expect(transportWith(fetchImpl)(message)).resolves.toEqual({
      delivered: false,
      failure: 'unavailable',
      message: 'Resend accepted the message without returning an id',
    });
  });
});
