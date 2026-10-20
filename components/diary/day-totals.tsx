'use client';

import { IconChevronDown } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { amountOf, knownAmountOf, saltOf } from '@/components/diary/amounts';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { cn } from '@/lib/utils';

export function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function DayTotals({ totals }: { totals: NutrientVector }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const detailId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="sr-only">
        Day totals
      </h2>
      <dl className="grid grid-cols-4 gap-2">
        <Amount label="Energy" value={amountOf(totals, 'energy_kcal')} />
        <Amount label="Protein" value={amountOf(totals, 'protein')} />
        <Amount label="Carbs" value={amountOf(totals, 'carbohydrate')} />
        <Amount label="Fat" value={amountOf(totals, 'fat')} />
      </dl>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded(!expanded)}
        className="-mx-2 flex min-h-11 items-center gap-1 self-start rounded-md px-2 text-muted-foreground text-sm hover:text-foreground"
      >
        More nutrients
        <IconChevronDown
          className={cn(
            'size-4 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
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
