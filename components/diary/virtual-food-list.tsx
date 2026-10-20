'use client';

import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { FoodRow } from '@/components/diary/food-search-results';
import type { FoodSummary } from '@/lib/db/food-search';

const estimatedRowHeight = 60;

const rowsBeyondTheViewport = 6;

export function VirtualFoodList({
  foods,
  scrollElement,
  onSelectFood,
}: {
  foods: readonly FoodSummary[];
  scrollElement: HTMLElement;
  onSelectFood: (food: FoodSummary) => void;
}) {
  const virtualizer = useVirtualizer({
    count: foods.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedRowHeight,
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) || estimatedRowHeight,
    overscan: rowsBeyondTheViewport,
    getItemKey: (index) => foods[index]?.id ?? index,
  });

  return (
    <ul
      className="relative divide-y"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map(({ index, start }) => {
        const food = foods[index];
        if (food === undefined) {
          return null;
        }
        return (
          <FoodRow
            key={food.id}
            ref={virtualizer.measureElement}
            data-index={index}
            aria-setsize={foods.length}
            aria-posinset={index + 1}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${start}px)` }}
            food={food}
            onSelect={() => onSelectFood(food)}
          />
        );
      })}
    </ul>
  );
}
