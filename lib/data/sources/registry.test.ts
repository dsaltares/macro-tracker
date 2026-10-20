import { describe, expect, it } from 'vitest';
import {
  chooseSources,
  deltaSources,
  registeredSources,
  sourceAdapters,
} from './registry.ts';
import type { FoodSource, SourceKind } from './types.ts';

const adapter =
  (id: string, kind: SourceKind = 'full'): (() => FoodSource) =>
  () => ({
    id,
    kind,
    emits: ['usda'],
    async *fetch() {},
  });

const adapters = {
  usda: adapter('usda'),
  'usda-deltas': adapter('usda-deltas', 'delta'),
  cofid: adapter('cofid'),
};

const idsOf = (sources: readonly FoodSource[]) => sources.map(({ id }) => id);

describe('chooseSources', () => {
  it('chooses every full adapter when no ids are named', () => {
    const chosen = chooseSources({ adapters });

    expect(chosen.found && idsOf(chosen.sources)).toEqual(['usda', 'cofid']);
  });

  it('chooses the named adapters in the order named, deltas included', () => {
    const chosen = chooseSources({
      ids: ['cofid', 'usda-deltas', 'usda'],
      adapters,
    });

    expect(chosen.found && idsOf(chosen.sources)).toEqual([
      'cofid',
      'usda-deltas',
      'usda',
    ]);
  });

  it('names every id with no adapter', () => {
    expect(
      chooseSources({ ids: ['usda', 'off', 'toString'], adapters }),
    ).toEqual({ found: false, unknown: ['off', 'toString'] });
  });
});

describe('registeredSources', () => {
  it('creates every full adapter', () => {
    expect(idsOf(registeredSources(adapters))).toEqual(['usda', 'cofid']);
  });

  it('registers Open Food Facts, CIQUAL, CoFID and USDA in full', () => {
    expect(idsOf(registeredSources(sourceAdapters))).toEqual([
      'off',
      'ciqual',
      'cofid',
      'usda',
    ]);
  });
});

describe('deltaSources', () => {
  it('creates every delta adapter', () => {
    expect(idsOf(deltaSources(adapters))).toEqual(['usda-deltas']);
  });

  it('registers the Open Food Facts deltas', () => {
    expect(idsOf(deltaSources(sourceAdapters))).toEqual(['off-deltas']);
  });
});
