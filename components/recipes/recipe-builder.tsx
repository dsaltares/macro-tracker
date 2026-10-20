'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  type Control,
  type UseFormReturn,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { formatQuantity } from '@/components/diary/amounts';
import {
  AmountSkeleton,
  IngredientAmountForm,
  ingredientLoadFailed,
  useIngredientSource,
} from '@/components/recipes/ingredient-amount';
import { IngredientSheet } from '@/components/recipes/ingredient-sheet';
import { RecipeNutrition } from '@/components/recipes/recipe-nutrition';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Ingredient, RecipeDetail } from '@/lib/db/recipes';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { recipeFieldsSchema } from '@/lib/domain/recipes/recipe-fields';
import { type Recipe, recipeNutrients } from '@/lib/domain/recipes/recipes';
import { recipeRoute, routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

export const recipeLoadFailed = 'This recipe could not be loaded.';

export const recipeArchived = 'This recipe is archived.';

export const saveFailed = 'The recipe could not be saved. Try again.';

export const archiveFailed = 'The recipe could not be archived. Try again.';

export const ingredientFailed =
  'The ingredients could not be changed. Try again.';

export const noIngredients = 'No ingredients yet.';

const fieldsSchema = z.object({
  name: recipeFieldsSchema.shape.name,
  servings: recipeFieldsSchema.shape.servings,
  cookedWeightG: recipeFieldsSchema.shape.cookedWeightG.unwrap().optional(),
});

type FieldValues = z.input<typeof fieldsSchema>;

const optionalNumber = (value: unknown) =>
  value === '' || value === null || value === undefined
    ? undefined
    : Number(value);

const numberProps = {
  type: 'number',
  inputMode: 'decimal',
  min: 0,
  step: 'any',
} as const;

const defaultServings = 1;

const fieldsOf = (values: FieldValues, notes: string | null) => ({
  name: values.name,
  servings: values.servings,
  cookedWeightG: values.cookedWeightG ?? null,
  notes,
});

function useRecipeFields(defaultValues: FieldValues) {
  return useForm<FieldValues>({
    resolver: zodResolver(fieldsSchema),
    defaultValues,
    mode: 'onTouched',
  });
}

function RecipeFields({
  id,
  form: {
    register,
    handleSubmit,
    formState: { errors },
  },
  failed,
  onSave,
}: {
  id: string;
  form: UseFormReturn<FieldValues>;
  failed: boolean;
  onSave: (values: FieldValues) => void;
}) {
  return (
    <form
      id={id}
      className="flex flex-col gap-1"
      method="post"
      onSubmit={handleSubmit(onSave)}
      noValidate
    >
      {failed ? <FormError>{saveFailed}</FormError> : null}
      <TextField
        label="Name"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Servings"
          {...numberProps}
          error={errors.servings?.message}
          {...register('servings', { valueAsNumber: true })}
        />
        <TextField
          label="Cooked weight (g)"
          {...numberProps}
          hint="Optional"
          error={errors.cookedWeightG?.message}
          {...register('cookedWeightG', { setValueAs: optionalNumber })}
        />
      </div>
    </form>
  );
}

function SaveRecipe({
  form,
  saving,
  children,
}: {
  form: string;
  saving: boolean;
  children: string;
}) {
  return (
    <Button
      type="submit"
      form={form}
      size="lg"
      className={submitButtonClass}
      disabled={saving}
    >
      {saving ? 'Saving…' : children}
    </Button>
  );
}

export function NewRecipe() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const create = useMutation(
    trpc.recipe.create.mutationOptions({
      onSuccess: async (id) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.recipe.list.queryKey(),
        });
        router.replace(recipeRoute(id));
      },
    }),
  );

  const form = useRecipeFields({ name: '', servings: defaultServings });
  const formId = useId();

  return (
    <div className="flex flex-col gap-6">
      <RecipeFields
        id={formId}
        form={form}
        failed={create.isError}
        onSave={(values) => create.mutate(fieldsOf(values, null))}
      />
      <SaveRecipe form={formId} saving={create.isPending || create.isSuccess}>
        Create recipe
      </SaveRecipe>
    </div>
  );
}

const usableNumber = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;

const liveRecipe = (
  saved: Recipe,
  servings: number | undefined,
  cookedWeightG: number | undefined,
): Recipe => ({
  servings: usableNumber(servings) ?? saved.servings,
  cookedWeightG: usableNumber(cookedWeightG) ?? null,
});

function LiveNutrition({
  recipe,
  control,
}: {
  recipe: RecipeDetail;
  control: Control<FieldValues>;
}) {
  const [servings, cookedWeightG] = useWatch({
    control,
    name: ['servings', 'cookedWeightG'],
  });
  const live = liveRecipe(recipe, servings, cookedWeightG);
  const nutrients = recipeNutrients(live, recipe.ingredients);

  return (
    <RecipeNutrition
      nutrients={
        recipe.ingredients.length === 0 || nutrients.grams <= 0
          ? null
          : nutrients
      }
    />
  );
}

const amountOfIngredient = ({ quantity, portionLabel, grams }: Ingredient) =>
  `${formatQuantity(quantity)} × ${portionLabel} · ${formatAmount(grams, 'g')}`;

function IngredientEditor({
  ingredient,
  onDone,
}: {
  ingredient: Ingredient;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isPending, isError, source } = useIngredientSource(
    ingredient.kind === 'food'
      ? { kind: 'food', foodId: ingredient.foodId ?? '' }
      : { kind: 'recipe', recipeId: ingredient.recipeId ?? '' },
  );
  const update = useMutation(
    trpc.recipe.updateIngredient.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.recipe.pathKey(),
        });
        onDone();
      },
    }),
  );

  if (isPending) {
    return <AmountSkeleton />;
  }
  if (isError || source === undefined) {
    return <FormError>{ingredientLoadFailed}</FormError>;
  }

  const portions = source.portions.some(
    ({ label }) => label === ingredient.portionLabel,
  )
    ? source.portions
    : [
        {
          label: ingredient.portionLabel,
          grams: ingredient.grams / ingredient.quantity,
        },
        ...source.portions,
      ];

  return (
    <IngredientAmountForm
      source={{ nutrients: ingredient.per100g, portions }}
      defaultValues={{
        quantity: ingredient.quantity,
        portion: ingredient.portionLabel,
      }}
      submit="Save"
      saving={update.isPending}
      failure={update.isError ? failureOf(update.error) : null}
      onSave={({ quantity, portion }) => {
        if (
          quantity === ingredient.quantity &&
          portion === ingredient.portionLabel
        ) {
          onDone();
          return;
        }
        update.mutate({
          id: ingredient.id,
          ...(quantity === ingredient.quantity ? {} : { quantity }),
          ...(portion === ingredient.portionLabel ? {} : { portion }),
        });
      }}
    />
  );
}

function IngredientDialog({
  ingredient,
  onClose,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={ingredient !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {ingredient === null ? null : (
        <DialogContent className="text-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{ingredient.name}</DialogTitle>
            <DialogDescription>
              How much goes into the recipe.
            </DialogDescription>
          </DialogHeader>
          <IngredientEditor ingredient={ingredient} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

const moved = (ids: readonly string[], from: number, to: number) => {
  const order = [...ids];
  const [id] = order.splice(from, 1);
  if (id !== undefined) {
    order.splice(to, 0, id);
  }
  return order;
};

function Ingredients({ recipe }: { recipe: RecipeDetail }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const afterChange = () =>
    queryClient.invalidateQueries({ queryKey: trpc.recipe.pathKey() });
  const remove = useMutation(
    trpc.recipe.removeIngredient.mutationOptions({ onSuccess: afterChange }),
  );
  const reorder = useMutation(
    trpc.recipe.reorder.mutationOptions({ onSuccess: afterChange }),
  );
  const changing = remove.isPending || reorder.isPending;
  const ids = recipe.ingredients.map(({ id }) => id);
  const move = (from: number, to: number) =>
    reorder.mutate({
      recipeId: recipe.id,
      ingredientIds: moved(ids, from, to),
    });
  const last = recipe.ingredients.length - 1;

  return (
    <section aria-labelledby="ingredients" className="flex flex-col gap-3">
      <h2 id="ingredients" className="font-semibold text-base">
        Ingredients
      </h2>
      {remove.isError || reorder.isError ? (
        <FormError>{ingredientFailed}</FormError>
      ) : null}
      {recipe.ingredients.length === 0 ? (
        <p className="text-muted-foreground text-sm">{noIngredients}</p>
      ) : (
        <ol className="-mx-4 flex flex-col divide-y">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={ingredient.id} className="flex items-center pr-2">
              <button
                type="button"
                className="flex min-h-14 min-w-0 flex-1 flex-col gap-0.5 px-4 py-2 text-left hover:bg-muted"
                onClick={() => setEditing(ingredient)}
              >
                <span className="truncate font-medium">{ingredient.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {amountOfIngredient(ingredient)}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Move ${ingredient.name} up`}
                disabled={changing || index === 0}
                onClick={() => move(index, index - 1)}
              >
                <IconArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Move ${ingredient.name} down`}
                disabled={changing || index === last}
                onClick={() => move(index, index + 1)}
              >
                <IconArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive"
                aria-label={`Remove ${ingredient.name}`}
                disabled={changing}
                onClick={() => remove.mutate(ingredient.id)}
              >
                <IconTrash className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11"
        onClick={() => setAdding(true)}
      >
        <IconPlus className="size-5" />
        Add ingredient
      </Button>
      <IngredientSheet
        recipeId={recipe.id}
        open={adding}
        onClose={() => setAdding(false)}
      />
      <IngredientDialog ingredient={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function ArchiveRecipe({ recipe }: { recipe: RecipeDetail }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const archive = useMutation(
    trpc.recipe.archive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.recipe.pathKey(),
        });
        router.push(routes.recipes);
      },
    }),
  );
  const working = archive.isPending || archive.isSuccess;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 text-destructive"
        onClick={() => setOpen(true)}
      >
        Archive recipe
      </Button>
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            Archive {recipe.name}?
          </DialogTitle>
          <DialogDescription>
            It leaves your recipes. Entries you already logged and recipes that
            contain it keep it.
          </DialogDescription>
        </DialogHeader>
        {archive.isError ? <FormError>{archiveFailed}</FormError> : null}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" className="h-11" />}
            disabled={working}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            className="h-11"
            disabled={working}
            onClick={() => archive.mutate(recipe.id)}
          >
            {working ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRecipe({ recipe }: { recipe: RecipeDetail }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const update = useMutation(
    trpc.recipe.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.recipe.pathKey(),
        });
        router.push(routes.recipes);
      },
    }),
  );

  const form = useRecipeFields({
    name: recipe.name,
    servings: recipe.servings,
    cookedWeightG: recipe.cookedWeightG ?? undefined,
  });
  const formId = useId();

  return (
    <div className="flex flex-col gap-6">
      <RecipeFields
        id={formId}
        form={form}
        failed={update.isError}
        onSave={(values) =>
          update.mutate({ id: recipe.id, ...fieldsOf(values, recipe.notes) })
        }
      />
      <Ingredients recipe={recipe} />
      <LiveNutrition recipe={recipe} control={form.control} />
      <div className="flex flex-col gap-2">
        <SaveRecipe form={formId} saving={update.isPending || update.isSuccess}>
          Save recipe
        </SaveRecipe>
        <ArchiveRecipe recipe={recipe} />
      </div>
    </div>
  );
}

export function RecipeBuilder({ recipeId }: { recipeId: string }) {
  const trpc = useTRPC();
  const recipe = useQuery(
    trpc.recipe.get.queryOptions(recipeId, { retry: false }),
  );

  if (recipe.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (recipe.isError) {
    return <FormError>{recipeLoadFailed}</FormError>;
  }
  if (recipe.data.archived) {
    return <p className="text-muted-foreground text-sm">{recipeArchived}</p>;
  }
  return <EditRecipe recipe={recipe.data} />;
}
