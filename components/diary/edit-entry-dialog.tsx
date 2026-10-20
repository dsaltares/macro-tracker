'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormError } from '@/components/auth/fields';
import { servingOf } from '@/components/diary/amounts';
import { EntryForm, type EntryValues } from '@/components/diary/entry-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiaryEntry } from '@/lib/db/diary';
import type { Food } from '@/lib/db/food-search';
import type { Portion } from '@/lib/domain/foods/portions';
import { useTRPC } from '@/lib/trpc/client';

export const saveFailed = 'Your change could not be saved. Try again.';

export const removeFailed = 'The entry could not be deleted. Try again.';

export const foodGone =
  'The food this entry was logged from no longer exists, so its amount cannot change.';

const placeholderQuantity = 1;

const valuesOf = (entry: DiaryEntry): EntryValues => ({
  quantity: entry.quantity ?? placeholderQuantity,
  portion: entry.portionLabel ?? '',
  meal: entry.meal,
  time: entry.time ?? '',
});

const changesFrom = (
  entry: DiaryEntry,
  values: EntryValues,
  amountEditable: boolean,
) => {
  const time = values.time === '' ? null : values.time;
  return {
    ...(values.meal !== entry.meal && { meal: values.meal }),
    ...(time !== entry.time && { time }),
    ...(amountEditable &&
      values.quantity !== entry.quantity && { quantity: values.quantity }),
    ...(amountEditable &&
      values.portion !== entry.portionLabel && { portion: values.portion }),
  };
};

const loggedPortionOf = (entry: DiaryEntry): Portion | null =>
  entry.portionLabel === null || entry.quantity === null || entry.grams === null
    ? null
    : { label: entry.portionLabel, grams: entry.grams / entry.quantity };

const portionsFor = (entry: DiaryEntry, food: Food): Portion[] => {
  const logged = loggedPortionOf(entry);
  return logged === null ||
    food.portions.some(({ label }) => label === logged.label)
    ? food.portions
    : [logged, ...food.portions];
};

function EditEntryForm({
  entry,
  food,
  onDone,
}: {
  entry: DiaryEntry;
  food: Food | null;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const amountEditable = food !== null;
  const refreshDiary = () =>
    queryClient.invalidateQueries({ queryKey: trpc.diary.day.queryKey() });
  const update = useMutation(
    trpc.diary.update.mutationOptions({
      onSuccess: async () => {
        await refreshDiary();
        onDone();
      },
    }),
  );
  const remove = useMutation(
    trpc.diary.remove.mutationOptions({
      onSuccess: async () => {
        await refreshDiary();
        onDone();
      },
    }),
  );
  const working = update.isPending || remove.isPending;

  return (
    <>
      {update.isError ? <FormError>{saveFailed}</FormError> : null}
      {remove.isError ? <FormError>{removeFailed}</FormError> : null}
      {entry.kind === 'food' && !amountEditable ? (
        <p className="text-muted-foreground text-sm">{foodGone}</p>
      ) : null}
      <EntryForm
        food={food}
        portions={food === null ? [] : portionsFor(entry, food)}
        logged={{ grams: entry.grams, nutrients: entry.nutrients }}
        defaultValues={valuesOf(entry)}
        saving={update.isPending}
        onSave={(values) => {
          const changes = changesFrom(entry, values, amountEditable);
          if (Object.keys(changes).length === 0) {
            onDone();
            return;
          }
          update.mutate({ id: entry.id, ...changes });
        }}
      >
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="h-11"
          disabled={working}
          onClick={() => remove.mutate(entry.id)}
        >
          {remove.isPending ? 'Deleting…' : 'Delete entry'}
        </Button>
      </EntryForm>
    </>
  );
}

function EditEntry({
  entry,
  onDone,
}: {
  entry: DiaryEntry;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const linksFood = entry.kind === 'food' && entry.foodId !== null;
  const food = useQuery(
    trpc.food.get.queryOptions(entry.foodId ?? '', {
      enabled: linksFood,
      retry: false,
    }),
  );

  if (linksFood && food.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  return (
    <EditEntryForm
      entry={entry}
      food={linksFood ? (food.data ?? null) : null}
      onDone={onDone}
    />
  );
}

export function EditEntryDialog({
  entry,
  onClose,
}: {
  entry: DiaryEntry | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {entry === null ? null : (
        <DialogContent className="max-h-[90dvh] overflow-y-auto text-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{entry.label}</DialogTitle>
            <DialogDescription>{servingOf(entry)}</DialogDescription>
          </DialogHeader>
          <EditEntry key={entry.id} entry={entry} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}
