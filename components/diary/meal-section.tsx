import { IconPlus } from '@tabler/icons-react';
import { useId } from 'react';
import {
  amountOf,
  macrosOf,
  mealNames,
  servingOf,
} from '@/components/diary/amounts';
import { MealMenu } from '@/components/diary/meal-menu';
import { Button } from '@/components/ui/button';
import type { DiaryEntry } from '@/lib/db/diary';
import type { Meal } from '@/lib/domain/diary/entries';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';

function EntryRow({
  entry,
  onSelect,
}: {
  entry: DiaryEntry;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{entry.label}</span>
          <span className="truncate text-muted-foreground text-xs">
            {servingOf(entry)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
          <span className="font-medium text-sm">
            {amountOf(entry.nutrients, 'energy_kcal')}
          </span>
          <span className="text-muted-foreground text-xs">
            {macrosOf(entry.nutrients)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function MealSection({
  date,
  meal,
  entries,
  totals,
  onSelectEntry,
  onAdd,
}: {
  date: string;
  meal: Meal;
  entries: readonly DiaryEntry[];
  totals: NutrientVector;
  onSelectEntry: (entry: DiaryEntry) => void;
  onAdd: () => void;
}) {
  const headingId = useId();
  const name = mealNames[meal];

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-lg border"
    >
      <div className="flex items-center gap-3 py-1 pr-1 pl-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id={headingId} className="font-semibold">
            {name}
          </h2>
          {entries.length > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {amountOf(totals, 'energy_kcal')} · {macrosOf(totals)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center">
          <MealMenu date={date} meal={meal} count={entries.length} />
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={onAdd}
          >
            <IconPlus className="size-5" />
            <span className="sr-only">Add to {name.toLowerCase()}</span>
          </Button>
        </div>
      </div>
      {entries.length > 0 ? (
        <ul className="flex flex-col divide-y border-t">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onSelect={() => onSelectEntry(entry)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
