export type Portion = {
  label: string;
  grams: number;
};

export const maxPortionLabelLength = 60;

const hundredGrams: Portion = { label: '100 g', grams: 100 };

const gramsPerMillilitreWithoutDensity = 1;

export const standardPortions: readonly Portion[] = [
  hundredGrams,
  { label: '1 g', grams: 1 },
  { label: '1 ml', grams: gramsPerMillilitreWithoutDensity },
];

export const withStandardPortions = <P extends Portion>(
  portions: readonly P[],
): (P | Portion)[] => [
  ...portions,
  ...standardPortions.filter(
    ({ label }) => !portions.some((portion) => portion.label === label),
  ),
];

export const isStandardLabel = (label: string) =>
  standardPortions.some((portion) => portion.label === label);

export const defaultPortion = (portions: readonly Portion[]): Portion =>
  portions[0] ?? hundredGrams;

export const gramsFor = (portion: Portion, quantity: number) =>
  portion.grams * quantity;
