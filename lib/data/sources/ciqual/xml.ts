export type XmlRecord = Record<string, string>;

const entities: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  apos: "'",
  quot: '"',
};
const entity = /&(lt|gt|amp|apos|quot);/g;
const childElement = /<(\w+)(?:\s[^>]*?)?(?:\/>|>([^<]*)<\/\1>)/g;

const decode = (text: string) =>
  text.replace(entity, (_, name: string) => entities[name] ?? '');

const recordOf = (body: string): XmlRecord =>
  Object.fromEntries(
    [...body.matchAll(childElement)].flatMap(([, name, text]) => {
      const value = text === undefined ? '' : decode(text).trim();
      return name === undefined || value === '' ? [] : [[name, value]];
    }),
  );

export async function* xmlRecords(
  chunks: AsyncIterable<Uint8Array>,
  tag: string,
): AsyncGenerator<XmlRecord> {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    let consumed = 0;
    for (
      let end = pending.indexOf(close);
      end !== -1;
      end = pending.indexOf(close, consumed)
    ) {
      const start = pending.lastIndexOf(open, end);
      if (start >= consumed) {
        yield recordOf(pending.slice(start + open.length, end));
      }
      consumed = end + close.length;
    }
    pending = pending.slice(consumed);
  }
}
