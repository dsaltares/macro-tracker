import { type NutrientKey, nutrients } from '../nutrition/nutrients.ts';
import type { NutrientVector } from '../nutrition/vector.ts';
import { type GoalKind, goalKind } from './drv.ts';

export type Progress = 'under' | 'near' | 'over';

const nearShare = 0.9;

const overShareByKind = {
  target: 1.1,
  upper: 1,
} as const satisfies Record<GoalKind, number>;

export const progressOf = (
  amount: number,
  goal: number,
  kind: GoalKind,
): Progress => {
  if (amount > goal * overShareByKind[kind]) return 'over';
  return amount >= goal * nearShare ? 'near' : 'under';
};

export const goalShare = (amount: number, goal: number) =>
  goal > 0 ? amount / goal : undefined;

export type NutrientProgress = {
  key: NutrientKey;
  kind: GoalKind;
  amount: number | undefined;
  goal: number | undefined;
  share: number | undefined;
  progress: Progress | undefined;
};

export const nutrientProgress = (
  totals: NutrientVector,
  goal: NutrientVector,
): NutrientProgress[] =>
  nutrients.map(({ key }) => {
    const amount = totals[key];
    const target = goal[key];
    const kind = goalKind(key);
    const known = amount !== undefined && target !== undefined;
    return {
      key,
      kind,
      amount,
      goal: target,
      share: known ? goalShare(amount, target) : undefined,
      progress: known ? progressOf(amount, target, kind) : undefined,
    };
  });

const unsharedRank = 2;

const shareRank = ({ kind, share }: NutrientProgress): [number, number] => {
  if (share === undefined) return [unsharedRank, 0];
  return kind === 'target' ? [0, share] : [1, -share];
};

export const byShare = (rows: readonly NutrientProgress[]) =>
  rows.toSorted((a, b) => {
    const [groupA, orderA] = shareRank(a);
    const [groupB, orderB] = shareRank(b);
    return groupA - groupB || orderA - orderB;
  });
