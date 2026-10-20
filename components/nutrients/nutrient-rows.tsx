import { type ReactNode, useId } from 'react';
import {
  nutrientGroupNames,
  nutrientNames,
} from '@/components/nutrients/nutrient-names';
import {
  amountIn,
  formatShare,
  goalOf,
  ProgressBar,
} from '@/components/nutrients/progress';
import type { NutrientProgress } from '@/lib/domain/goals/progress';
import {
  type NutrientGroup,
  nutrientByKey,
  nutrientGroups,
} from '@/lib/domain/nutrition/nutrients';

export const noData = 'No data';

type RowsProps = {
  rows: readonly NutrientProgress[];
  noteOf?: ((row: NutrientProgress) => ReactNode) | undefined;
};

function NutrientRow({
  row,
  note,
}: {
  row: NutrientProgress;
  note?: ReactNode;
}) {
  const name = nutrientNames[row.key];
  const { key, amount, goal, kind, share, progress } = row;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-baseline gap-2 text-sm">
        <dt className="min-w-0 flex-1 truncate">{name}</dt>
        <dd className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span
            className={
              amount === undefined ? 'text-muted-foreground' : 'font-medium'
            }
          >
            {amount === undefined ? noData : amountIn(key, amount)}
          </span>
          {goal === undefined ? null : (
            <span className="text-muted-foreground">
              {' '}
              {goalOf(key, goal, kind)}
            </span>
          )}
          {share === undefined ? null : (
            <span className="w-10 text-right text-muted-foreground">
              {' '}
              {formatShare(share)}
            </span>
          )}
        </dd>
      </div>
      {progress === undefined ? null : (
        <ProgressBar
          label={name}
          share={share}
          kind={kind}
          progress={progress}
        />
      )}
      {note === undefined ? null : (
        <dd className="text-muted-foreground text-xs">{note}</dd>
      )}
    </div>
  );
}

export function NutrientList({ rows, noteOf }: RowsProps) {
  return (
    <dl className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <NutrientRow key={row.key} row={row} note={noteOf?.(row)} />
      ))}
    </dl>
  );
}

function NutrientGroupSection({
  group,
  rows,
  noteOf,
}: RowsProps & { group: NutrientGroup }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="font-semibold text-sm">
        {nutrientGroupNames[group]}
      </h2>
      <NutrientList rows={rows} noteOf={noteOf} />
    </section>
  );
}

export function NutrientGroups({ rows, noteOf }: RowsProps) {
  return nutrientGroups.map((group) => (
    <NutrientGroupSection
      key={group}
      group={group}
      rows={rows.filter(({ key }) => nutrientByKey[key].group === group)}
      noteOf={noteOf}
    />
  ));
}
