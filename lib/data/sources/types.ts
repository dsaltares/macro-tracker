import type { Logger } from 'pino';
import type { SourceFood } from '../../domain/foods/source-food.ts';
import type { ReferenceSource } from '../../domain/foods/sources.ts';

export type SourceContext = {
  fetch: typeof globalThis.fetch;
  tempDir: string;
  logger: Logger;
  signal: AbortSignal;
};

export type FoodSource = {
  id: string;
  emits: readonly ReferenceSource[];
  fetch: (context: SourceContext) => AsyncIterable<SourceFood>;
};
