'use client';

import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { amountOf, knownAmountOf, saltOf } from '@/components/diary/amounts';
import {
  amountIn,
  goalOf,
  ProgressBar,
  ProgressMeter,
  percentOfMeter,
  progressStrokes,
  progressText,
} from '@/components/nutrients/progress';
import { goalKind } from '@/lib/domain/goals/drv';
import { goalShare, progressOf } from '@/lib/domain/goals/progress';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { nutrientsHref, routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const noGoal =
  'No goal for this day yet: it needs a weight on or before it.';

export function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

const ringSize = 120;
const ringStroke = 10;
const ringRadius = (ringSize - ringStroke) / 2;
const ringCircumference = 2 * Math.PI * ringRadius;
const percent = 100;

function EnergyRing({
  eaten,
  goal,
}: {
  eaten: number;
  goal: number | undefined;
}) {
  const kind = goalKind('energy_kcal');
  const progress = goal === undefined ? null : progressOf(eaten, goal, kind);
  const share = goal === undefined ? undefined : goalShare(eaten, goal);
  const filled =
    progress === null
      ? 0
      : share === undefined
        ? percent
        : percentOfMeter(share);
  const remaining = goal === undefined ? null : goal - eaten;

  return (
    <div className="relative size-30 shrink-0">
      {progress === null ? null : (
        <ProgressMeter
          label="Energy"
          filled={filled}
          valueText={progressText(share, kind, progress)}
        />
      )}
      <svg
        viewBox={`0 0 ${ringSize} ${ringSize}`}
        className="-rotate-90 size-full"
        aria-hidden
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={ringRadius}
          fill="none"
          strokeWidth={ringStroke}
          className="stroke-muted"
        />
        {progress === null ? null : (
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringRadius}
            fill="none"
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringCircumference * (1 - filled / percent)}
            className={progressStrokes[kind][progress]}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
        <span className="font-semibold">
          {amountIn('energy_kcal', Math.abs(remaining ?? eaten))}
        </span>{' '}
        <span className="text-muted-foreground text-xs">
          {remaining === null ? 'eaten' : remaining < 0 ? 'over' : 'left'}
        </span>
      </div>
    </div>
  );
}

const macros = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbohydrate', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

function MacroProgress({
  label,
  amount,
  goal,
  nutrientKey,
}: {
  label: string;
  amount: number;
  goal: number | undefined;
  nutrientKey: (typeof macros)[number]['key'];
}) {
  const kind = goalKind(nutrientKey);

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">
        <span className="font-medium">{amountIn(nutrientKey, amount)}</span>
        {goal === undefined ? null : (
          <span className="text-muted-foreground">
            {' '}
            {goalOf(nutrientKey, goal, kind)}
          </span>
        )}
      </dd>
      {goal === undefined ? null : (
        <dd className="col-span-2">
          <ProgressBar
            label={label}
            share={goalShare(amount, goal)}
            kind={kind}
            progress={progressOf(amount, goal, kind)}
          />
        </dd>
      )}
    </div>
  );
}

export function DayTotals({
  date,
  totals,
  goal,
}: {
  date: string;
  totals: NutrientVector;
  goal: NutrientVector | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const detailId = useId();
  const energyGoal = goal?.energy_kcal;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="sr-only">
        Day totals
      </h2>
      <div className="flex items-center gap-4">
        <EnergyRing eaten={totals.energy_kcal ?? 0} goal={energyGoal} />
        <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <dt className="text-muted-foreground">Energy</dt>
            <dd className="tabular-nums">
              <span className="font-medium">
                {amountOf(totals, 'energy_kcal')}
              </span>
              {energyGoal === undefined ? null : (
                <span className="text-muted-foreground">
                  {' '}
                  {goalOf('energy_kcal', energyGoal, 'target')}
                </span>
              )}
            </dd>
          </div>
          {macros.map(({ key, label }) => (
            <MacroProgress
              key={key}
              label={label}
              nutrientKey={key}
              amount={totals[key] ?? 0}
              goal={goal?.[key]}
            />
          ))}
        </dl>
      </div>
      {goal === null ? (
        <p className="text-muted-foreground text-sm">
          {noGoal}{' '}
          <Link href={routes.body} className="underline underline-offset-4">
            Log a weight
          </Link>
        </p>
      ) : null}
      <div className="-mx-2 flex items-center justify-between">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={() => setExpanded(!expanded)}
          className="flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground text-sm hover:text-foreground"
        >
          More nutrients
          <IconChevronDown
            className={cn(
              'size-4 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        <Link
          href={nutrientsHref(date)}
          className="flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground text-sm hover:text-foreground"
        >
          All nutrients
          <IconChevronRight className="size-4" />
        </Link>
      </div>
      <dl id={detailId} hidden={!expanded} className="grid grid-cols-4 gap-2">
        <Amount
          label="Saturates"
          value={knownAmountOf(totals, 'saturated_fat')}
        />
        <Amount label="Sugars" value={knownAmountOf(totals, 'sugars')} />
        <Amount label="Fibre" value={knownAmountOf(totals, 'fibre')} />
        <Amount label="Salt" value={saltOf(totals)} />
      </dl>
    </section>
  );
}
