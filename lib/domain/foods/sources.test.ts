import { describe, expect, it } from 'vitest';
import {
  genericSources,
  portionSources,
  referenceSources,
  sources,
} from './sources.ts';

describe('sources', () => {
  it('are the reference sources and the user', () => {
    expect(sources).toEqual([...referenceSources, 'user']);
    expect(referenceSources).toEqual(['off', 'ciqual', 'cofid', 'usda']);
  });

  it('call every reference source but Open Food Facts generic', () => {
    expect(genericSources).toEqual(['ciqual', 'cofid', 'usda']);
  });

  it('give a portion as upstream or the user', () => {
    expect(portionSources).toEqual(['upstream', 'user']);
  });
});
