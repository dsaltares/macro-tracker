import { z } from 'zod';

export const historySources = ['cronometer'] as const;

export type HistorySource = (typeof historySources)[number];

export const historySourceNames: Record<HistorySource, string> = {
  cronometer: 'Cronometer',
};

export const historyImportStatuses = [
  'running',
  'succeeded',
  'failed',
] as const;

export type HistoryImportStatus = (typeof historyImportStatuses)[number];

export const historyImportPhases = [
  'reading',
  'matching',
  'logging',
  'weights',
] as const;

export type HistoryImportPhase = (typeof historyImportPhases)[number];

export type HistoryImportProgress = {
  phase: HistoryImportPhase;
  done: number;
  total: number;
};

export const foodMatchKinds = [
  'source id',
  'name',
  'own copy',
  'new',
  'quick',
] as const;

export type FoodMatchKind = (typeof foodMatchKinds)[number];

const count = z.number().int().nonnegative();

export const historyImportSummarySchema = z.object({
  days: count,
  skippedDays: count,
  entries: count,
  quickEntries: count,
  skippedEntries: count,
  failedMeals: count,
  weights: count,
  skippedWeights: count,
  sourceKcal: z.number(),
  importedKcal: z.number(),
  foods: z.array(
    z.object({
      sourceId: z.string(),
      name: z.string(),
      kind: z.enum(foodMatchKinds),
      matchedTo: z.string().nullable(),
    }),
  ),
});

export type HistoryImportSummary = z.infer<typeof historyImportSummarySchema>;

export const interruptedHistoryImport =
  'The server restarted while the import was running. Start it again: it skips the days it already imported.';

export const isTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
};

export const startHistoryImportSchema = z.object({
  source: z.enum(historySources),
  email: z.string().trim().min(1, 'Enter your Cronometer email'),
  password: z.string().min(1, 'Enter your Cronometer password'),
  timeZone: z.string().refine(isTimeZone, { message: 'Not a time zone' }),
});

export type StartHistoryImport = z.infer<typeof startHistoryImportSchema>;
