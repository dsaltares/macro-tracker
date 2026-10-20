import { IconArrowLeft } from '@tabler/icons-react';
import { energyPer100g } from '@/components/diary/food-search-results';
import { SourceBadge } from '@/components/foods/source-badge';
import { Button } from '@/components/ui/button';
import type { FoodSummary } from '@/lib/db/food-search';

export function FoodStep({
  food,
  onBack,
}: {
  food: FoodSummary;
  onBack: () => void;
}) {
  return (
    <section
      aria-label={food.name}
      className="flex flex-col gap-3 overflow-y-auto px-4 pb-4"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-base">{food.name}</h3>
        {food.brand === null ? null : (
          <p className="text-muted-foreground text-sm">{food.brand}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm tabular-nums">
        {energyPer100g(food)}
        <SourceBadge source={food.source} />
      </div>
    </section>
  );
}
