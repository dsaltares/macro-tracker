export const genericSources = ['ciqual', 'cofid', 'usda'] as const;

export type GenericSource = (typeof genericSources)[number];

export const referenceSources = ['off', ...genericSources] as const;

export type ReferenceSource = (typeof referenceSources)[number];

export const sources = [...referenceSources, 'user'] as const;

export type Source = (typeof sources)[number];

export const portionSources = ['upstream', 'user'] as const;

export type PortionSource = (typeof portionSources)[number];
