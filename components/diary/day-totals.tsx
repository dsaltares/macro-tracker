'use client';

import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { amountOf, knownAmountOf, saltOf } from '@/components/diary/amounts';
import {
  energyColour,
  isOver,
  type MacroKey,
  macroColours,
  nutrientFill,
  overStroke,
  overText,
} from '@/components/nutrients/nutrient-colours';
import {
  amountIn,
  goalOf,
  ProgressBar,
  ProgressMeter,
  percentOfMeter,
  progressText,
} from '@/components/nutrients/progress';
import { goalKind } from '@/lib/domain/goals/drv';
import { goalShare, progressOf } from '@/lib/domain/goals/progress';
import {
  kcalPerGram,
  type NutrientVector,
} from '@/lib/domain/nutrition/vector';
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

const macros = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbohydrate', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

type RingSegment = { stroke: string; start: number; length: number };

const ringSegments = (
  totals: NutrientVector,
  filled: number,
  over: boolean,
): RingSegment[] => {
  const energies = macros.map(({ key }) => ({
    stroke: macroColours[key].stroke,
    kcal: (totals[key] ?? 0) * kcalPerGram[key],
  }));
  const macroKcal = energies.reduce((all, { kcal }) => all + kcal, 0);
  if (over || macroKcal === 0) {
    return [
      {
        stroke: over ? overStroke : energyColour.stroke,
        start: 0,
        length: filled,
      },
    ];
  }
  let start = 0;
  return energies.map(({ stroke, kcal }) => {
    const length = (filled * kcal) / macroKcal;
    const segment = { stroke, start, length };
    start += length;
    return segment;
  });
};

const energyOver = (eaten: number, goal: number | undefined) =>
  goal !== undefined &&
  isOver(progressOf(eaten, goal, goalKind('energy_kcal')));

const ringSize = 120;
const ringStroke = 10;
const ringRadius = (ringSize - ringStroke) / 2;
const ringCircumference = 2 * Math.PI * ringRadius;
const percent = 100;

function EnergyRing({
  totals,
  goal,
}: {
  totals: NutrientVector;
  goal: number | undefined;
}) {
  const eaten = totals.energy_kcal ?? 0;
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
        {progress === null
          ? null
          : ringSegments(totals, filled, isOver(progress)).map(
              ({ stroke, start, length }) => (
                <circle
                  key={stroke}
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  fill="none"
                  strokeWidth={ringStroke}
                  strokeDasharray={`${(ringCircumference * length) / percent} ${ringCircumference}`}
                  strokeDashoffset={(-ringCircumference * start) / percent}
                  className={stroke}
                />
              ),
            )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
        <span className={cn('font-semibold', isOver(progress) && overText)}>
          {amountIn('energy_kcal', Math.abs(remaining ?? eaten))}
        </span>{' '}
        <span
          className={cn(
            'text-xs',
            isOver(progress) ? overText : 'text-muted-foreground',
          )}
        >
          {remaining === null ? 'eaten' : remaining < 0 ? 'over' : 'left'}
        </span>
      </div>
    </div>
  );
}

function MacroProgress({
  label,
  amount,
  goal,
  nutrientKey,
}: {
  label: string;
  amount: number;
  goal: number | undefined;
  nutrientKey: MacroKey;
}) {
  const kind = goalKind(nutrientKey);
  const progress = goal === undefined ? null : progressOf(amount, goal, kind);

  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-1 text-sm">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span
          aria-hidden
          className={cn('size-2 rounded-full', macroColours[nutrientKey].fill)}
        />
        {label}
      </dt>
      <dd className="tabular-nums">
        <span className={cn('font-medium', isOver(progress) && overText)}>
          {amountIn(nutrientKey, amount)}
        </span>
        {goal === undefined ? null : (
          <span className="text-muted-foreground">
            {' '}
            {goalOf(nutrientKey, goal, kind)}
          </span>
        )}
      </dd>
      {goal === undefined || progress === null ? null : (
        <dd className="col-span-2">
          <ProgressBar
            label={label}
            share={goalShare(amount, goal)}
            kind={kind}
            progress={progress}
            fill={nutrientFill(nutrientKey, progress)}
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
        <EnergyRing totals={totals} goal={energyGoal} />
        <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <dt className="text-muted-foreground">Energy</dt>
            <dd className="tabular-nums">
              <span
                className={cn(
                  'font-medium',
                  energyOver(totals.energy_kcal ?? 0, energyGoal) && overText,
                )}
              >
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
