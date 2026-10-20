import { describe, expect, it, vi } from 'vitest';
import { createLogTransport, loggedId } from './log-transport.ts';

const message = {
  to: 'eater@example.test',
  subject: 'Reset your password',
  html: '<p>Reset at https://macros.example.test/reset</p>',
  text: 'Reset at https://macros.example.test/reset',
};

describe('createLogTransport', () => {
  it('prints the reason, the recipient and the plain text body', async () => {
    const log = vi.fn();

    await createLogTransport('RESEND_API_KEY is not set', log)(message);

    const [line] = log.mock.calls[0] as [string];
    expect(line).toContain('RESEND_API_KEY is not set');
    expect(line).toContain('eater@example.test');
    expect(line).toContain('Reset your password');
    expect(line).toContain('https://macros.example.test/reset');
  });

  it('reports the message as delivered so a caller is never blocked', async () => {
    await expect(
      createLogTransport('RESEND_API_KEY is not set', vi.fn())(message),
    ).resolves.toEqual({ delivered: true, id: loggedId });
  });
});
