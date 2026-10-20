import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOutboxTransport, readOutbox } from './outbox.ts';
import type { SendEmail } from './transport.ts';

const message = {
  to: 'eater@example.test',
  subject: 'Confirm your email',
  html: '<p>Confirm</p>',
  text: 'Confirm at https://macros.example.test/verify',
};

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'macro-tracker-outbox-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

const delivered: SendEmail = () =>
  Promise.resolve({ delivered: true, id: 'logged' });

describe('createOutboxTransport', () => {
  it('keeps every message, in the order they were sent', async () => {
    const send = createOutboxTransport(join(directory, 'outbox'), delivered);

    await send(message);
    await send({ ...message, subject: 'Reset your password' });

    expect(await readOutbox(join(directory, 'outbox'))).toEqual([
      message,
      { ...message, subject: 'Reset your password' },
    ]);
  });

  it('hands the message on and answers with what the next transport said', async () => {
    const next = vi.fn(delivered);

    await expect(
      createOutboxTransport(directory, next)(message),
    ).resolves.toEqual({ delivered: true, id: 'logged' });
    expect(next).toHaveBeenCalledWith(message);
  });

  it('still hands the message on when the outbox cannot be written', async () => {
    const next = vi.fn(delivered);
    const aFile = join(directory, 'not-a-directory');
    writeFileSync(aFile, '');

    await createOutboxTransport(join(aFile, 'outbox'), next)(message);

    expect(next).toHaveBeenCalledWith(message);
  });

  it('keeps the order of messages sent within the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000);
    const send = createOutboxTransport(directory, delivered);
    const subjects = Array.from({ length: 20 }, (_, n) => `Message ${n}`);

    for (const subject of subjects) {
      await send({ ...message, subject });
    }

    expect((await readOutbox(directory)).map(({ subject }) => subject)).toEqual(
      subjects,
    );
  });

  it('never reads a message that is still being written', async () => {
    await createOutboxTransport(directory, delivered)(message);
    writeFileSync(join(directory, '1760000000000-half.json.partial'), '{"to":');

    expect(await readOutbox(directory)).toEqual([message]);
  });

  it('reads an outbox nobody has written to as empty', async () => {
    expect(await readOutbox(join(directory, 'missing'))).toEqual([]);
  });
});
