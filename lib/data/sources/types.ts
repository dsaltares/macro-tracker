import type { Logger } from 'pino';
import type { SourceFood } from '../../domain/foods/source-food.ts';
import type { ReferenceSource } from '../../domain/foods/sources.ts';

export type SourceContext = {
  fetch: typeof globalThis.fetch;
  tempDir: string;
  logger: Logger;
  signal: AbortSignal;
  lastSucceededAt: string | null;
};

export type SourceKind = 'full' | 'delta';

export type FoodSource = {
  id: string;
  kind: SourceKind;
  emits: readonly ReferenceSource[];
  fetch: (context: SourceContext) => AsyncIterable<SourceFood>;
};
