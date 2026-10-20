import { describe, expect, it } from 'vitest';
import { entryKinds, meals } from './entries.ts';

describe('diary entries', () => {
  it('belong to one of four meals, in the order of a day', () => {
    expect(meals).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('are a food, a recipe or a quick entry', () => {
    expect(entryKinds).toEqual(['food', 'recipe', 'quick']);
  });
});
