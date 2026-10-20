import { useId } from 'react';
import { knownAmountOf } from '@/components/diary/amounts';
import { Amount } from '@/components/diary/day-totals';
import { formatAmount } from '@/lib/domain/nutrition/format';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import type { RecipeNutrients } from '@/lib/domain/recipes/recipes';

export const noIngredientsYet =
  'Add ingredients to see its nutrition per serving and per 100 g.';

function NutritionPer({
  title,
  nutrients,
}: {
  title: string;
  nutrients: NutrientVector;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="font-medium text-muted-foreground text-xs">
        {title}
      </h3>
      <dl className="grid grid-cols-4 gap-2">
        <Amount
          label="Energy"
          value={knownAmountOf(nutrients, 'energy_kcal')}
        />
        <Amount label="Protein" value={knownAmountOf(nutrients, 'protein')} />
        <Amount
          label="Carbs"
          value={knownAmountOf(nutrients, 'carbohydrate')}
        />
        <Amount label="Fat" value={knownAmountOf(nutrients, 'fat')} />
      </dl>
    </section>
  );
}

export function RecipeNutrition({
  nutrients,
}: {
  nutrients: RecipeNutrients | null;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="font-semibold text-base">
        Nutrition
      </h2>
      {nutrients === null ? (
        <p className="text-muted-foreground text-sm">{noIngredientsYet}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Makes {formatAmount(nutrients.grams, 'g')}
          </p>
          <NutritionPer title="Per serving" nutrients={nutrients.perServing} />
          <NutritionPer title="Per 100 g" nutrients={nutrients.per100g} />
        </>
      )}
    </section>
  );
}
