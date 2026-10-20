import type { GoalKind } from '@/lib/domain/goals/drv';
import type { Progress } from '@/lib/domain/goals/progress';
import { formatAmount } from '@/lib/domain/nutrition/format';
import {
  type NutrientKey,
  nutrientByKey,
} from '@/lib/domain/nutrition/nutrients';
import { cn } from '@/lib/utils';

export const progressWords: Record<GoalKind, Record<Progress, string>> = {
  target: { under: 'under target', near: 'on target', over: 'over target' },
  upper: { under: 'under limit', near: 'near limit', over: 'over limit' },
};

export const progressFills: Record<GoalKind, Record<Progress, string>> = {
  target: {
    under: 'bg-sky-500',
    near: 'bg-emerald-500',
    over: 'bg-amber-500',
  },
  upper: {
    under: 'bg-emerald-500',
    near: 'bg-amber-500',
    over: 'bg-destructive',
  },
};

export const progressStrokes: Record<GoalKind, Record<Progress, string>> = {
  target: {
    under: 'stroke-sky-500',
    near: 'stroke-emerald-500',
    over: 'stroke-amber-500',
  },
  upper: {
    under: 'stroke-emerald-500',
    near: 'stroke-amber-500',
    over: 'stroke-destructive',
  },
};

const percentFormat = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export const formatShare = (share: number) => percentFormat.format(share);

export const amountIn = (key: NutrientKey, amount: number) =>
  formatAmount(amount, nutrientByKey[key].unit);

export const goalOf = (key: NutrientKey, goal: number, kind: GoalKind) =>
  kind === 'upper' ? `max ${amountIn(key, goal)}` : `of ${amountIn(key, goal)}`;

export const progressText = (
  share: number | undefined,
  kind: GoalKind,
  progress: Progress,
) =>
  share === undefined
    ? progressWords[kind][progress]
    : `${formatShare(share)}, ${progressWords[kind][progress]}`;

const fullShare = 1;
const percent = 100;

export const percentOfMeter = (share: number) =>
  Math.round(Math.min(share, fullShare) * percent);

export function ProgressMeter({
  label,
  filled,
  valueText,
}: {
  label: string;
  filled: number;
  valueText: string;
}) {
  return (
    <meter
      aria-label={label}
      min={0}
      max={percent}
      value={filled}
      aria-valuetext={valueText}
      className="sr-only"
    />
  );
}

export function ProgressBar({
  label,
  share,
  kind,
  progress,
  className,
}: {
  label: string;
  share: number | undefined;
  kind: GoalKind;
  progress: Progress;
  className?: string;
}) {
  const filled = share === undefined ? percent : percentOfMeter(share);

  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <ProgressMeter
        label={label}
        filled={filled}
        valueText={progressText(share, kind, progress)}
      />
      <div
        aria-hidden
        className={cn('h-full rounded-full', progressFills[kind][progress])}
        style={{ width: `${filled}%` }}
      />
    </div>
  );
}
