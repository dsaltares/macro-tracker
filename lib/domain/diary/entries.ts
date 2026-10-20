export const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type Meal = (typeof meals)[number];

export const entryKinds = ['food', 'recipe', 'quick'] as const;

export type EntryKind = (typeof entryKinds)[number];
