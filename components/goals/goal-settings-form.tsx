'use client';

import { IconAlertTriangle, IconArrowBackUp } from '@tabler/icons-react';
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import type { z } from 'zod';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { WeightForm } from '@/components/body/weight-form';
import { nutrientNames } from '@/components/nutrients/nutrient-names';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToday } from '@/components/use-today';
import type { GoalWarning } from '@/lib/domain/goals/derived';
import {
  ageBandOf,
  dietaryReferenceValues,
  goalKind,
} from '@/lib/domain/goals/drv';
import { maximumWeeklyRateKg, minimumKcal } from '@/lib/domain/goals/energy';
import { type Goal, goalOn } from '@/lib/domain/goals/goal';
import {
  defaultGoalSettings,
  type GoalMode,
  type GoalSettings,
  goalSettingsSchema,
  maxProteinGPerKg,
} from '@/lib/domain/goals/settings';
import { formatAmount, roundAmount } from '@/lib/domain/nutrition/format';
import {
  type NutrientGroup,
  type NutrientKey,
  nutrientByKey,
  nutrientKeys,
} from '@/lib/domain/nutrition/nutrients';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { ageOn, type Profile, type Sex } from '@/lib/domain/profile';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'Your goals could not be loaded.';

export const saveFailed = 'Your goals could not be saved. Try again.';

export const invalidAmount = 'Enter an amount of 0 or more.';

const manualKeys = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
] as const satisfies readonly NutrientKey[];

type ManualKey = (typeof manualKeys)[number];

const manualKeySet: ReadonlySet<NutrientKey> = new Set(manualKeys);

const isManualKey = (key: NutrientKey): key is ManualKey =>
  manualKeySet.has(key);

const manualLabels: Record<ManualKey, string> = {
  energy_kcal: 'Energy (kcal)',
  protein: 'Protein (g)',
  carbohydrate: 'Carbs (g)',
  fat: 'Fat (g)',
};

const microKeys = nutrientKeys.filter(
  (key) => key in dietaryReferenceValues,
) as (keyof typeof dietaryReferenceValues)[];

type MicroKey = (typeof microKeys)[number];

const microSections: readonly {
  label: string;
  groups: readonly NutrientGroup[];
}[] = [
  {
    label: 'Fibre, saturated fat and sugars',
    groups: ['macros', 'fat_detail', 'carbohydrate_detail'],
  },
  { label: 'Minerals', groups: ['minerals'] },
  { label: 'Vitamins', groups: ['vitamins'] },
];

const weeklyRateLimit = 1;
const weeklyRateStep = 0.05;
const percent = 100;

type Draft = {
  mode: GoalMode;
  weeklyRateKg: number;
  proteinGPerKg: string;
  fatPercent: string;
  targets: Partial<Record<NutrientKey, string>>;
};

const decimals = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

const draftOf = (settings: GoalSettings): Draft => ({
  mode: settings.mode,
  weeklyRateKg: settings.weeklyRateKg,
  proteinGPerKg: String(settings.proteinGPerKg),
  fatPercent: String(roundAmount(settings.fatEnergyShare * percent, 'g')),
  targets: Object.fromEntries(
    Object.entries(settings.overrides).map(([key, amount]) => [
      key,
      String(amount),
    ]),
  ),
});

const amountOf = (text: string | undefined) =>
  text === undefined || text.trim() === '' ? undefined : Number(text);

const overridesOf = ({ mode, targets }: Draft): NutrientVector =>
  Object.fromEntries(
    (Object.entries(targets) as [NutrientKey, string][]).flatMap(
      ([key, text]) => {
        const amount = amountOf(text);
        if (amount === undefined) return [];
        if (mode === 'derived' && isManualKey(key)) return [];
        return [[key, amount]];
      },
    ),
  );

const settingsOf = (draft: Draft): GoalSettings => ({
  mode: draft.mode,
  weeklyRateKg: draft.weeklyRateKg,
  proteinGPerKg: amountOf(draft.proteinGPerKg) ?? Number.NaN,
  fatEnergyShare: (amountOf(draft.fatPercent) ?? Number.NaN) / percent,
  overrides: overridesOf(draft),
});

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const isValidAmount = (amount: number | undefined) =>
  amount !== undefined && Number.isFinite(amount) && amount >= 0;

const previewOf = (settings: GoalSettings): GoalSettings => ({
  ...settings,
  proteinGPerKg: finiteOr(
    settings.proteinGPerKg,
    defaultGoalSettings.proteinGPerKg,
  ),
  fatEnergyShare: finiteOr(
    settings.fatEnergyShare,
    defaultGoalSettings.fatEnergyShare,
  ),
  overrides: Object.fromEntries(
    Object.entries(settings.overrides).filter(([, amount]) =>
      isValidAmount(amount),
    ),
  ),
});

const manualOverridesOf = (overrides: NutrientVector): NutrientVector =>
  Object.fromEntries(
    manualKeys.flatMap((key) =>
      overrides[key] === undefined ? [] : [[key, overrides[key]]],
    ),
  );

type Errors = Partial<Record<string, string>>;

const errorsOf = (issues: readonly z.core.$ZodIssue[]): Errors => {
  const errors: Errors = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    errors[path] ??=
      path.startsWith('overrides.') && issue.code !== 'custom'
        ? invalidAmount
        : issue.message;
  }
  return errors;
};

const overrideError = (key: NutrientKey) => `overrides.${key}`;

const warningMessage = (warning: GoalWarning, sex: Sex) =>
  ({
    energy_below_minimum: `This target is under ${formatAmount(minimumKcal[sex], 'kcal')} a day, the least usually advised without medical supervision.`,
    rate_above_maximum: `This rate is over ${maximumWeeklyRateKg} kg a week, faster than usually advised.`,
    carbohydrate_floored:
      'Protein and fat take up all of the energy, so carbohydrate is 0 g.',
  })[warning];

export const formatWeeklyRate = (kg: number) => {
  if (kg === 0) return 'Keep your weight';
  const amount = `${decimals.format(Math.abs(kg))} kg a week`;
  return kg < 0 ? `Lose ${amount}` : `Gain ${amount}`;
};

const amountIn = (key: NutrientKey, amount: number | undefined) =>
  amount === undefined ? '—' : formatAmount(amount, nutrientByKey[key].unit);

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Warnings({ goal, sex }: { goal: Goal | null; sex: Sex }) {
  if (!goal?.warnings.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {goal.warnings.map((warning) => (
        <Alert key={warning}>
          <IconAlertTriangle />
          <AlertDescription>{warningMessage(warning, sex)}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function WeeklyRateField({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label id={labelId}>Weekly rate</Label>
        <span className="text-sm tabular-nums">{formatWeeklyRate(value)}</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        className="py-3"
        min={-weeklyRateLimit}
        max={weeklyRateLimit}
        step={weeklyRateStep}
        value={[value]}
        onValueChange={(next) => {
          const [rate] = Array.isArray(next) ? next : [next];
          if (rate !== undefined) onValueChange(rate);
        }}
      />
    </div>
  );
}

function DerivedFields({
  draft,
  goal,
  errors,
  onChange,
}: {
  draft: Draft;
  goal: Goal | null;
  errors: Errors;
  onChange: (draft: Partial<Draft>) => void;
}) {
  return (
    <>
      {goal ? (
        <dl className="grid grid-cols-3 gap-2">
          <Amount label="BMR" value={amountIn('energy_kcal', goal.bmr ?? 0)} />
          <Amount
            label="TDEE"
            value={amountIn('energy_kcal', goal.tdee ?? 0)}
          />
          <Amount
            label="Target"
            value={amountIn('energy_kcal', goal.nutrients.energy_kcal)}
          />
        </dl>
      ) : null}
      <WeeklyRateField
        value={draft.weeklyRateKg}
        onValueChange={(weeklyRateKg) => onChange({ weeklyRateKg })}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Protein (g per kg)"
          type="number"
          inputMode="decimal"
          min={0}
          max={maxProteinGPerKg}
          step="any"
          value={draft.proteinGPerKg}
          error={errors.proteinGPerKg}
          onChange={(event) => onChange({ proteinGPerKg: event.target.value })}
        />
        <TextField
          label="Fat (% of energy)"
          type="number"
          inputMode="decimal"
          min={0}
          max={percent}
          step="any"
          value={draft.fatPercent}
          error={errors.fatEnergyShare}
          onChange={(event) => onChange({ fatPercent: event.target.value })}
        />
      </div>
      {goal ? (
        <dl className="grid grid-cols-4 gap-2">
          <Amount
            label="Protein"
            value={amountIn('protein', goal.nutrients.protein)}
          />
          <Amount
            label="Carbs"
            value={amountIn('carbohydrate', goal.nutrients.carbohydrate)}
          />
          <Amount label="Fat" value={amountIn('fat', goal.nutrients.fat)} />
          <Amount
            label="Fibre"
            value={amountIn('fibre', goal.nutrients.fibre)}
          />
        </dl>
      ) : null}
    </>
  );
}

function ManualFields({
  draft,
  errors,
  onTargetChange,
}: {
  draft: Draft;
  errors: Errors;
  onTargetChange: (key: NutrientKey, text: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {manualKeys.map((key) => (
        <TextField
          key={key}
          label={manualLabels[key]}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.targets[key] ?? ''}
          error={errors[overrideError(key)]}
          onChange={(event) => onTargetChange(key, event.target.value)}
        />
      ))}
    </div>
  );
}

function MicroGoalField({
  nutrientKey,
  defaultAmount,
  value,
  error,
  onChange,
}: {
  nutrientKey: MicroKey;
  defaultAmount: number | undefined;
  value: string;
  error: string | undefined;
  onChange: (text: string) => void;
}) {
  const name = nutrientNames[nutrientKey];
  const { unit } = nutrientByKey[nutrientKey];
  const kind = goalKind(nutrientKey) === 'upper' ? 'Upper limit' : 'Target';
  const overridden = value.trim() !== '';

  return (
    <TextField
      label={`${name} (${unit})`}
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={value}
      placeholder={
        defaultAmount === undefined
          ? undefined
          : String(roundAmount(defaultAmount, unit))
      }
      error={error}
      hint={`${kind} · default ${amountIn(nutrientKey, defaultAmount)}`}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        overridden ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground"
            onClick={() => onChange('')}
          >
            <IconArrowBackUp className="size-4" />
            <span className="sr-only">Reset {name}</span>
          </Button>
        ) : null
      }
    />
  );
}

function MicroGoals({
  draft,
  defaults,
  errors,
  onTargetChange,
}: {
  draft: Draft;
  defaults: (key: MicroKey) => number | undefined;
  errors: Errors;
  onTargetChange: (key: NutrientKey, text: string) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-semibold">
          Micronutrients
        </h2>
        <p className="text-muted-foreground text-sm">
          Each defaults to its dietary reference value. Enter an amount to set
          your own.
        </p>
      </div>
      {microSections.map((section) => (
        <fieldset key={section.label} className="flex flex-col gap-1">
          <legend className="mb-2 font-medium text-muted-foreground text-sm">
            {section.label}
          </legend>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {microKeys
              .filter((key) =>
                section.groups.includes(nutrientByKey[key].group),
              )
              .map((key) => (
                <MicroGoalField
                  key={key}
                  nutrientKey={key}
                  defaultAmount={defaults(key)}
                  value={draft.targets[key] ?? ''}
                  error={errors[overrideError(key)]}
                  onChange={(text) => onTargetChange(key, text)}
                />
              ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
}

function GoalEditor({
  profile,
  today,
  weightKg,
  settings,
  submit,
  working,
  onSaved,
}: {
  profile: Profile;
  today: string;
  weightKg: number | null;
  settings: GoalSettings;
  submit: string;
  working: string;
  onSaved: (settings: GoalSettings) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const save = useMutation(
    trpc.goals.set.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(trpc.goals.get.queryKey(), saved);
        return queryClient.invalidateQueries({
          queryKey: trpc.goals.forDate.pathKey(),
        });
      },
    }),
  );
  const [draft, setDraft] = useState(() => draftOf(settings));
  const [submitted, setSubmitted] = useState(false);
  const energyHeadingId = useId();

  const current = settingsOf(draft);
  const parsed = goalSettingsSchema.safeParse(current);
  const errors =
    submitted && !parsed.success ? errorsOf(parsed.error.issues) : {};
  const preview = previewOf(current);
  const goal = goalOn(profile, weightKg, today, preview);
  const baseGoal = goalOn(profile, weightKg, today, {
    ...preview,
    overrides:
      preview.mode === 'manual' ? manualOverridesOf(preview.overrides) : {},
  });
  const band = ageBandOf(ageOn(profile.birthDate, today));
  const defaults = (key: MicroKey) => {
    if (baseGoal) return baseGoal.nutrients[key];
    const amount = dietaryReferenceValues[key].amounts[profile.sex][band];
    return 'perDay' in amount ? amount.perDay : undefined;
  };

  const change = (next: Partial<Draft>) =>
    setDraft((previous) => ({ ...previous, ...next }));
  const changeTarget = (key: NutrientKey, text: string) =>
    setDraft((previous) => ({
      ...previous,
      targets: { ...previous.targets, [key]: text },
    }));
  const changeMode = (manual: boolean) =>
    setDraft((previous) => {
      const mode: GoalMode = manual ? 'manual' : 'derived';
      const needsTargets =
        manual && goal && manualKeys.every((key) => !previous.targets[key]);
      return {
        ...previous,
        mode,
        targets: needsTargets
          ? {
              ...previous.targets,
              ...Object.fromEntries(
                manualKeys.map((key) => [
                  key,
                  String(
                    roundAmount(
                      goal.nutrients[key] ?? 0,
                      nutrientByKey[key].unit,
                    ),
                  ),
                ]),
              ),
            }
          : previous.targets,
      };
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (parsed.success) {
      save.mutate(parsed.data, { onSuccess: onSaved });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {draft.mode === 'derived' && weightKg === null ? (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">
            Your energy target is worked out from your weight. Log it to see
            your targets.
          </p>
          <WeightForm today={today} pickDate={false} />
        </section>
      ) : null}
      <form
        className="flex flex-col gap-6"
        method="post"
        onSubmit={onSubmit}
        noValidate
      >
        {save.isError ? <FormError>{saveFailed}</FormError> : null}
        <section
          aria-labelledby={energyHeadingId}
          className="flex flex-col gap-4 rounded-lg border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={energyHeadingId} className="font-semibold">
              Energy and macros
            </h2>
            <Label className="gap-2 font-normal text-sm">
              Set manually
              <Switch
                checked={draft.mode === 'manual'}
                onCheckedChange={changeMode}
              />
            </Label>
          </div>
          {draft.mode === 'derived' ? (
            <DerivedFields
              draft={draft}
              goal={goal}
              errors={errors}
              onChange={change}
            />
          ) : (
            <ManualFields
              draft={draft}
              errors={errors}
              onTargetChange={changeTarget}
            />
          )}
          <Warnings goal={goal} sex={profile.sex} />
        </section>
        <MicroGoals
          draft={draft}
          defaults={defaults}
          errors={errors}
          onTargetChange={changeTarget}
        />
        <Button
          type="submit"
          size="lg"
          disabled={save.isPending}
          className={submitButtonClass}
        >
          {save.isPending ? working : submit}
        </Button>
      </form>
    </div>
  );
}

export function GoalSettingsForm({
  profile,
  submit,
  working,
  onSaved,
}: {
  profile: Profile;
  submit: string;
  working: string;
  onSaved: (settings: GoalSettings) => void;
}) {
  const trpc = useTRPC();
  const today = useToday();
  const settings = useQuery(trpc.goals.get.queryOptions());
  const latest = useQuery(
    trpc.body.latest.queryOptions(
      today === null ? skipToken : { metric: 'weight_kg', onOrBefore: today },
    ),
  );

  if (settings.isError || latest.isError) {
    return <FormError>{loadFailed}</FormError>;
  }
  if (today === null || !settings.isSuccess || !latest.isSuccess) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <GoalEditor
      profile={profile}
      today={today}
      weightKg={latest.data?.value ?? null}
      settings={settings.data}
      submit={submit}
      working={working}
      onSaved={onSaved}
    />
  );
}
