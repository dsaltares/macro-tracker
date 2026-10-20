import { z } from 'zod';

export const apiKeyScopes = ['read', 'write'] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const maxApiKeyNameLength = 60;

export const newApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(
      maxApiKeyNameLength,
      `Keep it under ${maxApiKeyNameLength} characters`,
    ),
  scopes: z
    .array(z.enum(apiKeyScopes))
    .min(1, 'Choose at least one scope')
    .transform((scopes) =>
      apiKeyScopes.filter((scope) => scopes.includes(scope)),
    ),
});

export type NewApiKey = z.output<typeof newApiKeySchema>;
