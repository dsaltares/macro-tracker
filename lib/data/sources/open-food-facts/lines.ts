import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

async function* linesOf(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of chunks) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split(
      '\n',
    );
    pending = lines.pop() ?? '';
    yield* lines;
  }
  pending += decoder.decode();
  if (pending !== '') {
    yield pending;
  }
}

export const decompressedLines = (bytes: AsyncIterable<Uint8Array>) =>
  linesOf(Readable.from(bytes).compose(createGunzip()));
