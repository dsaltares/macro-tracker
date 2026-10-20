import { describe, expect, it } from 'vitest';
import {
  maxRecipeNameLength,
  maxRecipeNotesLength,
  recipeFieldsSchema,
} from './recipe-fields.ts';

const chili = {
  name: '  Chili  ',
  servings: 4,
  cookedWeightG: null,
  notes: 'Simmer for an hour',
};

describe('recipeFieldsSchema', () => {
  it('trims the name and keeps the notes', () => {
    expect(recipeFieldsSchema.parse(chili)).toEqual({
      ...chili,
      name: 'Chili',
    });
  });

  it('turns blank notes into none', () => {
    expect(recipeFieldsSchema.parse({ ...chili, notes: '   ' }).notes).toBe(
      null,
    );
  });

  it.each([
    ['a blank name', { name: '  ' }],
    ['a long name', { name: 'a'.repeat(maxRecipeNameLength + 1) }],
    ['no servings', { servings: 0 }],
    ['a cooked weight of zero', { cookedWeightG: 0 }],
    ['long notes', { notes: 'a'.repeat(maxRecipeNotesLength + 1) }],
  ])('refuses %s', (_, overrides) => {
    expect(
      recipeFieldsSchema.safeParse({ ...chili, ...overrides }).success,
    ).toBe(false);
  });
});
