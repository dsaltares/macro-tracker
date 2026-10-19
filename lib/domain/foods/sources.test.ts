import { describe, expect, it } from 'vitest';
import { portionSources, referenceSources, sources } from './sources.ts';

describe('sources', () => {
  it('are the reference sources and the user', () => {
    expect(sources).toEqual([...referenceSources, 'user']);
    expect(referenceSources).toEqual(['off', 'ciqual', 'cofid', 'usda']);
  });

  it('give a portion as upstream or the user', () => {
    expect(portionSources).toEqual(['upstream', 'user']);
  });
});
