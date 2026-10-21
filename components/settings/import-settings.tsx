'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, PasswordField } from '@/components/auth/fields';
import { SelectField } from '@/components/diary/entry-form';
import { Button } from '@/components/ui/button';
import type { HistoryImport } from '@/lib/db/history-imports';
import { formatDay, localDateOf } from '@/lib/domain/dates';
import {
  type FoodMatchKind,
  type HistoryImportPhase,
  type HistorySource,
  historySourceNames,
  historySources,
  startHistoryImportSchema,
} from '@/lib/domain/imports/history-import';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

export const loadFailed = 'Your last import could not be loaded.';

export const pollIntervalMs = 1000;

const phaseLabels: Record<HistoryImportPhase, string> = {
  reading: 'Reading your history',
  matching: 'Matching foods',
  logging: 'Logging your diary',
  weights: 'Logging your weights',
};

const matchLabels: Record<FoodMatchKind, string> = {
  'source id': 'The same food',
  name: 'Matched by name',
  'own copy': 'Your food from an earlier import',
  new: 'New food of yours',
  quick: 'Quick entries',
};

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

const dayOf = (instant: string) => formatDay(localDateOf(new Date(instant)));

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function ImportForm({ running }: { running: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<HistorySource>(historySources[0]);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string>();
  const start = useMutation(
    trpc.historyImport.start.mutationOptions({
      onSuccess: async () => {
        setApiKey('');
        await queryClient.invalidateQueries({
          queryKey: trpc.historyImport.latest.queryKey(),
        });
      },
    }),
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = startHistoryImportSchema.safeParse({
      source,
      apiKey,
      timeZone: browserTimeZone(),
    });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.apiKey?.[0]);
      return;
    }
    setError(undefined);
    start.mutate(parsed.data);
  };

  return (
    <form
      aria-labelledby="new-import"
      className="flex flex-col gap-3"
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      <h2 id="new-import" className="font-semibold text-lg">
        Import your history
      </h2>
      <p className="text-muted-foreground text-sm">
        Brings your diary, the foods you logged and your weights into this
        account. Days you have already logged here are left alone, so you can
        run it again to pick up new days. Your key is used for this import and
        never stored.
      </p>
      {start.isError ? <FormError>{failureOf(start.error)}</FormError> : null}
      <SelectField
        label="Import from"
        value={source}
        onChange={(event) => setSource(event.target.value as HistorySource)}
      >
        {historySources.map((option) => (
          <option key={option} value={option}>
            {historySourceNames[option]}
          </option>
        ))}
      </SelectField>
      <PasswordField
        label="fitness-tracker API key"
        autoComplete="off"
        hint="The API_KEY your fitness-tracker runs with"
        error={error}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <Button
        type="submit"
        size="lg"
        disabled={running || start.isPending}
        className={submitButtonClass}
      >
        {start.isPending ? 'Starting…' : 'Import'}
      </Button>
    </form>
  );
}

function Running({ run }: { run: HistoryImport }) {
  const measured = run.total > 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">
        {phaseLabels[run.phase]}
        {measured ? ` · ${run.done} of ${run.total}` : '…'}
      </p>
      <div
        role="progressbar"
        aria-label={phaseLabels[run.phase]}
        aria-valuemin={0}
        aria-valuemax={measured ? run.total : undefined}
        aria-valuenow={measured ? run.done : undefined}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{
            width: measured ? `${(run.done / run.total) * 100}%` : '10%',
          }}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        You can leave this page. We will email you when it is done.
      </p>
    </div>
  );
}

function Succeeded({ run }: { run: HistoryImport }) {
  const { summary } = run;
  if (summary === null) {
    return null;
  }
  const facts = [
    ['Days imported', summary.days],
    ['Days skipped, already logged', summary.skippedDays],
    ['Entries', summary.entries],
    ['Of them quick entries', summary.quickEntries],
    ['Weights', summary.weights],
    ['Energy in your old app', `${number.format(summary.sourceKcal)} kcal`],
    ['Energy imported', `${number.format(summary.importedKcal)} kcal`],
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">
        Finished {run.finished_at ? dayOf(run.finished_at) : ''}
      </p>
      {summary.failedMeals > 0 ? (
        <FormError>
          {`${summary.failedMeals} meals could not be imported. Run the import again to retry them.`}
        </FormError>
      ) : null}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="text-right tabular-nums">
              {typeof value === 'number' ? number.format(value) : value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.foods.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            What each of {summary.foods.length} foods became
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {summary.foods.map((food) => (
              <li key={food.sourceId} className="flex flex-col">
                <span>{food.name}</span>
                <span className="text-muted-foreground text-xs">
                  {matchLabels[food.kind]}
                  {food.matchedTo ? `: ${food.matchedTo}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function LatestImport({ run }: { run: HistoryImport }) {
  return (
    <section
      aria-labelledby="latest-import"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="latest-import" className="font-semibold text-lg">
        {run.status === 'running' ? 'Importing' : 'Last import'}
      </h2>
      {run.status === 'running' ? <Running run={run} /> : null}
      {run.status === 'succeeded' ? <Succeeded run={run} /> : null}
      {run.status === 'failed' ? (
        <FormError>{run.error ?? 'The import stopped.'}</FormError>
      ) : null}
    </section>
  );
}

export function ImportSettings() {
  const trpc = useTRPC();
  const latest = useQuery(
    trpc.historyImport.latest.queryOptions(undefined, {
      refetchInterval: (query) =>
        query.state.data?.status === 'running' ? pollIntervalMs : false,
    }),
  );
  const run = latest.data ?? null;

  return (
    <div className="flex flex-col gap-8">
      {latest.isError ? <FormError>{loadFailed}</FormError> : null}
      {run ? <LatestImport run={run} /> : null}
      <ImportForm running={run?.status === 'running'} />
    </div>
  );
}
