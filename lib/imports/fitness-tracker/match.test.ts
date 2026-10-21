import { describe, expect, it } from 'vitest';
import {
  type Candidate,
  closestAgreeing,
  macrosAgree,
  ownCopyAmong,
  searchQueriesFor,
  vectorOf,
} from './match.ts';

const potato = { energy_kcal: 87, protein: 1.9, carbohydrate: 20, fat: 0.1 };

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'a',
  source: 'usda',
  name: 'Potatoes, boiled',
  brand: null,
  nutrients: potato,
  ...overrides,
});

describe('macrosAgree', () => {
  it('allows 5 kcal or 3% of energy and 1 g or 5% of each macro', () => {
    expect(macrosAgree(potato, { ...potato, energy_kcal: 92 })).toBe(true);
    expect(macrosAgree(potato, { ...potato, energy_kcal: 93 })).toBe(false);
    expect(macrosAgree(potato, { ...potato, carbohydrate: 21 })).toBe(true);
    expect(macrosAgree(potato, { ...potato, carbohydrate: 21.1 })).toBe(false);
    expect(
      macrosAgree(
        { energy_kcal: 900, fat: 100 },
        { energy_kcal: 884, fat: 100 },
      ),
    ).toBe(true);
  });

  it('reads a missing macro as zero and fills energy from the macros', () => {
    expect(
      macrosAgree({ protein: 10, carbohydrate: 0, fat: 0 }, { protein: 10 }),
    ).toBe(true);
    expect(macrosAgree({ protein: 10 }, { protein: 10, fat: 5 })).toBe(false);
  });

  it('compares sugars, fibre and saturated fat only when both declare them', () => {
    expect(macrosAgree({ ...potato, sugars: 0.9 }, potato)).toBe(true);
    expect(
      macrosAgree({ ...potato, sugars: 0.9 }, { ...potato, sugars: 5.7 }),
    ).toBe(false);
  });
});

describe('vectorOf', () => {
  it('drops the nutrients a food does not declare', () => {
    expect(vectorOf({ energy_kcal: 87, fat: null })).toEqual({
      energy_kcal: 87,
    });
  });
});

describe('closestAgreeing', () => {
  it('is the candidate naming every word whose macros are closest', () => {
    const near = candidate({
      id: 'near',
      nutrients: { ...potato, energy_kcal: 88 },
    });
    const nearer = candidate({ id: 'nearer' });
    const far = candidate({
      id: 'far',
      nutrients: { ...potato, energy_kcal: 120 },
    });

    expect(
      closestAgreeing({ words: 'Potatoes Boiled', nutrients: potato }, [
        far,
        near,
        nearer,
      ]),
    ).toBe(nearer);
  });

  it('refuses a candidate missing a word, in its name or brand', () => {
    const strawberry = { words: 'Pudding, Strawberry', nutrients: potato };

    expect(
      closestAgreeing(strawberry, [candidate({ name: 'Pudding, blueberry' })]),
    ).toBeNull();
    expect(
      closestAgreeing(strawberry, [
        candidate({ name: 'Pudding', brand: 'Strawberry Farms' }),
      ]),
    ).not.toBeNull();
  });
});

describe('ownCopyAmong', () => {
  it("is the caller's food of the same name and macros", () => {
    const own = candidate({ id: 'own', source: 'user', name: 'chia seeds ' });
    const target = { name: 'Chia Seeds', nutrients: potato };

    expect(ownCopyAmong(target, [candidate(), own])).toBe(own);
    expect(
      ownCopyAmong(target, [
        { ...own, nutrients: { ...potato, energy_kcal: 200 } },
      ]),
    ).toBeNull();
  });
});

describe('searchQueriesFor', () => {
  it('is each query once by its words', () => {
    expect(
      searchQueriesFor(['Hacendado, Salmorejo Fresco', 'Salmorejo Fresco']),
    ).toEqual(['Hacendado Salmorejo Fresco', 'Salmorejo Fresco']);
    expect(searchQueriesFor(['Honey', 'honey', ', '])).toEqual(['Honey']);
  });
});
