import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useId } from 'react';
import {
  amountOf,
  macrosOf,
  mealNames,
  servingOf,
} from '@/components/diary/amounts';
import { EntryMenu } from '@/components/diary/entry-menu';
import { MealMenu } from '@/components/diary/meal-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DiaryEntry } from '@/lib/db/diary';
import type { Meal } from '@/lib/domain/diary/entries';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { cn } from '@/lib/utils';

function EntryRow({
  entry,
  onSelect,
  onCopy,
}: {
  entry: DiaryEntry;
  onSelect: () => void;
  onCopy: () => void;
}) {
  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-2 pl-4 text-left hover:bg-muted"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{entry.label}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            {entry.kind === 'recipe' ? (
              <Badge variant="outline">Recipe</Badge>
            ) : null}
            <span className="truncate text-muted-foreground text-xs">
              {servingOf(entry)}
            </span>
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
      <EntryMenu entry={entry} onCopy={onCopy} />
    </li>
  );
}

export function MealSection({
  date,
  meal,
  entries,
  totals,
  collapsed,
  copied,
  onToggle,
  onSelectEntry,
  onCopyEntry,
  onAdd,
}: {
  date: string;
  meal: Meal;
  entries: readonly DiaryEntry[];
  totals: NutrientVector;
  collapsed: boolean;
  copied: DiaryEntry | null;
  onToggle: () => void;
  onSelectEntry: (entry: DiaryEntry) => void;
  onCopyEntry: (entry: DiaryEntry) => void;
  onAdd: () => void;
}) {
  const headingId = useId();
  const entriesId = useId();
  const name = mealNames[meal];
  const hasEntries = entries.length > 0;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-lg border"
    >
      <div className="flex items-center gap-3 py-1 pr-1 pl-1">
        <h2 className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={hasEntries ? !collapsed : undefined}
            aria-controls={hasEntries ? entriesId : undefined}
            disabled={!hasEntries}
            onClick={onToggle}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left enabled:hover:bg-muted"
          >
            <IconChevronDown
              aria-hidden
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                collapsed && '-rotate-90',
                !hasEntries && 'invisible',
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span id={headingId} className="font-semibold">
                {name}
              </span>
              {hasEntries ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {amountOf(totals, 'energy_kcal')} · {macrosOf(totals)}
                </span>
              ) : null}
            </span>
          </button>
        </h2>
        <div className="flex items-center">
          <MealMenu
            date={date}
            meal={meal}
            count={entries.length}
            copied={copied}
          />
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
      {hasEntries ? (
        <ul
          id={entriesId}
          hidden={collapsed}
          className="flex flex-col divide-y border-t"
        >
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onSelect={() => onSelectEntry(entry)}
              onCopy={() => onCopyEntry(entry)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
