'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ComponentProps, useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { mealNames, servingOf } from '@/components/diary/amounts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { DiaryEntry } from '@/lib/db/diary';
import { meals } from '@/lib/domain/diary/entries';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const saveFailed = 'Your change could not be saved. Try again.';

export const removeFailed = 'The entry could not be deleted. Try again.';

export const foodGone =
  'The food this entry was logged from no longer exists, so its amount cannot change.';

const entrySchema = z.object({
  quantity: z
    .number({ error: 'Enter a quantity' })
    .positive({ error: 'Enter a quantity above zero' }),
  portion: z.string(),
  meal: z.enum(meals),
  time: z.string(),
});

type EntryValues = z.infer<typeof entrySchema>;

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

function SelectField({
  label,
  className,
  children,
  ...select
}: ComponentProps<'select'> & { label: string }) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={cn(
          'h-11 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
        {...select}
      >
        {children}
      </select>
    </div>
  );
}

function usePortionLabels(entry: DiaryEntry, amountEditable: boolean) {
  const trpc = useTRPC();
  const food = useQuery(
    trpc.food.get.queryOptions(entry.foodId ?? '', {
      enabled: amountEditable,
    }),
  );
  const labels = food.data?.portions.map(({ label }) => label) ?? [];
  return entry.portionLabel === null || labels.includes(entry.portionLabel)
    ? labels
    : [entry.portionLabel, ...labels];
}

function EditEntryForm({
  entry,
  onDone,
}: {
  entry: DiaryEntry;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isFoodEntry = entry.kind === 'food';
  const amountEditable = isFoodEntry && entry.foodId !== null;
  const portionLabels = usePortionLabels(entry, amountEditable);
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: valuesOf(entry),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit((values) => {
    const changes = changesFrom(entry, values, amountEditable);
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    update.mutate({ id: entry.id, ...changes });
  });

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      onSubmit={onSubmit}
      noValidate
    >
      {update.isError ? <FormError>{saveFailed}</FormError> : null}
      {remove.isError ? <FormError>{removeFailed}</FormError> : null}
      {isFoodEntry && !amountEditable ? (
        <p className="text-muted-foreground text-sm">{foodGone}</p>
      ) : null}
      {amountEditable ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            error={errors.quantity?.message}
            {...register('quantity', { valueAsNumber: true })}
          />
          <SelectField label="Portion" {...register('portion')}>
            {portionLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Meal" {...register('meal')}>
          {meals.map((meal) => (
            <option key={meal} value={meal}>
              {mealNames[meal]}
            </option>
          ))}
        </SelectField>
        <TextField label="Time" type="time" {...register('time')} />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" className="h-11" disabled={working}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
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
      </div>
    </form>
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
        <DialogContent className="text-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{entry.label}</DialogTitle>
            <DialogDescription>{servingOf(entry)}</DialogDescription>
          </DialogHeader>
          <EditEntryForm key={entry.id} entry={entry} onDone={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}
