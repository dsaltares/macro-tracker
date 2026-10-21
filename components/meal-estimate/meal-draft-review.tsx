'use client';

import {
  IconArrowBackUp,
  IconPlus,
  IconReplace,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/auth/fields';
import { amountOf, mealNames } from '@/components/diary/amounts';
import { Amount } from '@/components/diary/day-totals';
import { entriesCount } from '@/components/diary/meal-menu';
import { emptyRecipe } from '@/components/diary/recipe-step';
import { SourceBadge } from '@/components/foods/source-badge';
import {
  type ChosenSource,
  FoodAmount,
  foodToDraft,
  GuessAmountForm,
  RecipeAmount,
  recipeToDraft,
  SourceSearch,
  StepSection,
} from '@/components/meal-estimate/draft-item-editors';
import { MealFeedback } from '@/components/meal-estimate/meal-feedback';
import type { MealPhoto } from '@/components/meal-estimate/meal-photo-step';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Meal } from '@/lib/domain/diary/entries';
import {
  type DraftChange,
  draftOfItems,
  type MealDraft,
  type MealDraftItem,
  mealDraftToEntries,
  replacedDraftItem,
} from '@/lib/domain/diary/meal-estimate';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const logMealFailed = 'The meal could not be logged. Try again.';

export const replaceFailed = 'That food could not be loaded. Try again.';

export const revisedNote = 'Revised as you asked. Changed lines are marked.';

const changeLabels: Record<DraftChange, string | null> = {
  added: 'New',
  changed: 'Changed',
  unchanged: null,
};

export type Revision = {
  changes: readonly DraftChange[];
  onUndo: () => void;
};

export type Feedback = {
  photos: readonly MealPhoto[];
  description: string;
  roundsLeft: number;
  onRevised: (sent: MealDraft, revised: MealDraft) => void;
};

export const unresolvedNote =
  'Not found in your foods or the food database. Replace it, or enter its amounts.';

type KeyedItem = { key: number; item: MealDraftItem };

type ReviewStep =
  | { step: 'list' }
  | { step: 'editing'; key: number }
  | { step: 'adding' }
  | { step: 'amount'; chosen: ChosenSource }
  | { step: 'replacing'; key: number };

const keyedItems = (items: readonly MealDraftItem[]): KeyedItem[] =>
  items.map((item, index) => ({ key: index, item }));

const mealName = (meal: Meal) => mealNames[meal].toLowerCase();

function DraftTotals({ totals }: { totals: MealDraft['totals'] }) {
  return (
    <section
      aria-label="Meal totals"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h3 className="font-medium text-muted-foreground text-xs">Meal totals</h3>
      <dl className="grid grid-cols-4 gap-2">
        <Amount label="Energy" value={amountOf(totals, 'energy_kcal')} />
        <Amount label="Protein" value={amountOf(totals, 'protein')} />
        <Amount label="Carbs" value={amountOf(totals, 'carbohydrate')} />
        <Amount label="Fat" value={amountOf(totals, 'fat')} />
      </dl>
    </section>
  );
}

function FoodSource({ foodId }: { foodId: string }) {
  const trpc = useTRPC();
  const food = useQuery(trpc.food.get.queryOptions(foodId));
  return food.isSuccess ? <SourceBadge source={food.data.source} /> : null;
}

function ItemBadge({ item }: { item: MealDraftItem }) {
  switch (item.kind) {
    case 'food':
      return <FoodSource foodId={item.foodId} />;
    case 'recipe':
      return <Badge variant="outline">Recipe</Badge>;
    case 'guess':
      return <Badge variant="outline">Estimate</Badge>;
  }
}

const noteOf = (item: MealDraftItem) =>
  item.kind === 'guess' && item.unresolved ? unresolvedNote : item.note;

function DraftRow({
  item,
  change,
  onEdit,
  onReplace,
  onRemove,
}: {
  item: MealDraftItem;
  change: DraftChange;
  onEdit: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const note = noteOf(item);
  const flagged = item.unsure || (item.kind === 'guess' && item.unresolved);
  const changeLabel = changeLabels[change];

  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3',
        flagged && 'border-amber-500 bg-amber-500/5',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          onClick={onEdit}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.name}</span>
            <ItemBadge item={item} />
            {changeLabel === null ? null : (
              <Badge variant="secondary">{changeLabel}</Badge>
            )}
            {flagged ? (
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-700 dark:text-amber-400"
              >
                Check
              </Badge>
            ) : null}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatAmount(item.grams, 'g')} ·{' '}
            {amountOf(item.nutrients, 'energy_kcal')}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Replace ${item.name}`}
          onClick={onReplace}
        >
          <IconReplace className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
        >
          <IconTrash className="size-5" />
        </Button>
      </div>
      {note === null ? null : (
        <p className="text-amber-700 text-xs dark:text-amber-400">{note}</p>
      )}
    </li>
  );
}

function ItemEditor({
  item,
  onSave,
}: {
  item: MealDraftItem;
  onSave: (item: MealDraftItem) => void;
}) {
  switch (item.kind) {
    case 'food':
      return <FoodAmount foodId={item.foodId} item={item} onSave={onSave} />;
    case 'recipe':
      return (
        <RecipeAmount recipeId={item.recipeId} item={item} onSave={onSave} />
      );
    case 'guess':
      return <GuessAmountForm item={item} onSave={onSave} />;
  }
}

function useLoadSource() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async (chosen: ChosenSource) => {
    if (chosen.kind === 'food') {
      const food = await queryClient.fetchQuery(
        trpc.food.get.queryOptions(chosen.id),
      );
      return { kind: 'food' as const, food: foodToDraft(food) };
    }
    const recipe = await queryClient.fetchQuery(
      trpc.recipe.get.queryOptions(chosen.id),
    );
    return recipe.ingredients.length === 0
      ? null
      : { kind: 'recipe' as const, recipe: recipeToDraft(recipe) };
  };
}

export function MealDraftReview({
  draft,
  revision,
  feedback,
  date,
  meal,
  onBack,
  onLogged,
}: {
  draft: MealDraft;
  revision: Revision | null;
  feedback: Feedback;
  date: string;
  meal: Meal;
  onBack: () => void;
  onLogged: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const loadSource = useLoadSource();
  const [items, setItems] = useState(() => keyedItems(draft.items));
  const [nextKey, setNextKey] = useState(draft.items.length);
  const [step, setStep] = useState<ReviewStep>({ step: 'list' });
  const current = draftOfItems(
    items.map(({ item }) => item),
    draft.notes,
  );

  const toList = () => setStep({ step: 'list' });
  const save = (key: number, item: MealDraftItem) => {
    setItems((all) =>
      all.map((keyed) => (keyed.key === key ? { key, item } : keyed)),
    );
    toList();
  };
  const append = (item: MealDraftItem) => {
    setItems((all) => [...all, { key: nextKey, item }]);
    setNextKey((key) => key + 1);
    toList();
  };
  const remove = (key: number) =>
    setItems((all) => all.filter((keyed) => keyed.key !== key));

  const replace = useMutation({
    mutationFn: async ({
      key,
      chosen,
    }: {
      key: number;
      chosen: ChosenSource;
    }) => ({ key, replacement: await loadSource(chosen) }),
    onSuccess: ({ key, replacement }) => {
      const replaced = items.find((keyed) => keyed.key === key);
      if (replaced !== undefined && replacement !== null) {
        save(key, replacedDraftItem(replaced.item, replacement));
      }
    },
  });

  const log = useMutation(
    trpc.diary.addMeal.mutationOptions({
      onSuccess: async (entries) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.diary.pathKey(),
        });
        toast.success(
          `Logged ${entriesCount(entries.length)} to ${mealName(meal)}`,
        );
        onLogged();
      },
    }),
  );

  if (step.step === 'editing') {
    const editing = items.find(({ key }) => key === step.key);
    if (editing !== undefined) {
      return (
        <StepSection
          label={editing.item.name}
          back="Back to the meal"
          onBack={toList}
        >
          <h3 className="font-semibold text-base">{editing.item.name}</h3>
          <ItemEditor
            item={editing.item}
            onSave={(item) => save(editing.key, item)}
          />
        </StepSection>
      );
    }
  }

  if (step.step === 'adding') {
    return (
      <SourceSearch
        label="Search foods"
        initialQuery=""
        back="Back to the meal"
        onBack={toList}
        onChoose={(chosen) => setStep({ step: 'amount', chosen })}
      />
    );
  }

  if (step.step === 'amount') {
    const { chosen } = step;
    return (
      <StepSection
        label={chosen.name}
        back="Back to search"
        onBack={() => setStep({ step: 'adding' })}
      >
        <h3 className="font-semibold text-base">{chosen.name}</h3>
        {chosen.kind === 'food' ? (
          <FoodAmount foodId={chosen.id} item={null} onSave={append} />
        ) : (
          <RecipeAmount recipeId={chosen.id} item={null} onSave={append} />
        )}
      </StepSection>
    );
  }

  if (step.step === 'replacing') {
    const replacing = items.find(({ key }) => key === step.key);
    if (replacing !== undefined) {
      return (
        <>
          {replace.isError || replace.data?.replacement === null ? (
            <div className="px-4">
              <FormError>
                {replace.isError ? replaceFailed : emptyRecipe}
              </FormError>
            </div>
          ) : null}
          <SourceSearch
            label="Search foods"
            initialQuery={replacing.item.name}
            back="Back to the meal"
            onBack={toList}
            onChoose={(chosen) =>
              replace.mutate({ key: replacing.key, chosen })
            }
          />
        </>
      );
    }
  }

  return (
    <>
      <StepSection
        label="Review the meal"
        back="Back to photos"
        onBack={onBack}
      >
        {revision === null ? null : (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
            <p role="status" className="flex-1 text-sm">
              {revisedNote}
            </p>
            <Button
              variant="outline"
              className="h-11"
              onClick={revision.onUndo}
            >
              <IconArrowBackUp className="size-5" />
              Undo
            </Button>
          </div>
        )}
        <DraftTotals totals={current.totals} />
        {items.length === 0 ? (
          <p className="py-2 text-center text-muted-foreground">
            Nothing to log. Add an item.
          </p>
        ) : (
          <ul aria-label="Items" className="flex flex-col gap-2">
            {items.map(({ key, item }) => (
              <DraftRow
                key={key}
                item={item}
                change={revision?.changes[key] ?? 'unchanged'}
                onEdit={() => setStep({ step: 'editing', key })}
                onReplace={() => {
                  replace.reset();
                  setStep({ step: 'replacing', key });
                }}
                onRemove={() => remove(key)}
              />
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          className="h-11 self-start"
          onClick={() => setStep({ step: 'adding' })}
        >
          <IconPlus className="size-5" />
          Add item
        </Button>
        {current.notes.length === 0 ? null : (
          <ul
            aria-label="Notes"
            className="flex flex-col gap-1 text-muted-foreground text-xs"
          >
            {current.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <MealFeedback {...feedback} draft={current} />
      </StepSection>
      <div className="flex flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {log.isError ? <FormError>{logMealFailed}</FormError> : null}
        <Button
          size="lg"
          className="h-11"
          disabled={items.length === 0 || log.isPending}
          onClick={() =>
            log.mutate({
              date,
              meal,
              time: null,
              items: mealDraftToEntries(current),
            })
          }
        >
          {log.isPending ? 'Logging…' : 'Log meal'}
        </Button>
      </div>
    </>
  );
}
