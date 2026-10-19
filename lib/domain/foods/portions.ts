export type Portion = {
  label: string;
  grams: number;
};

const hundredGrams: Portion = { label: '100 g', grams: 100 };

export const standardPortions: readonly Portion[] = [
  hundredGrams,
  { label: '1 g', grams: 1 },
];

export const withStandardPortions = (
  portions: readonly Portion[],
): Portion[] => [
  ...portions,
  ...standardPortions.filter(
    ({ label }) => !portions.some((portion) => portion.label === label),
  ),
];

export const defaultPortion = (portions: readonly Portion[]): Portion =>
  portions[0] ?? hundredGrams;
