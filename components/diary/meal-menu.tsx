'use client';

import {
  IconCopy,
  IconCopyPlus,
  IconDots,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { FormError, TextField } from '@/components/auth/fields';
import { mealNames } from '@/components/diary/amounts';
import { dayLabel } from '@/components/diary/day-navigation';
import { SelectField } from '@/components/diary/entry-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToday } from '@/components/use-today';
import { addDays, isDate } from '@/lib/domain/dates';
import { type Meal, meals } from '@/lib/domain/diary/entries';
import { useTRPC } from '@/lib/trpc/client';

export const copyFailed = 'The meal could not be copied. Try again.';

export const clearFailed = 'The meal could not be cleared. Try again.';

export const entriesCount = (count: number) =>
  count === 1 ? '1 entry' : `${count} entries`;

const mealName = (meal: Meal) => mealNames[meal].toLowerCase();

function useDayLabel() {
  const today = useToday();
  return (date: string) => (today === null ? date : dayLabel(date, today));
}

function useRefreshDiary() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: trpc.diary.pathKey() });
}

function CopyToDialog({
  open,
  date,
  meal,
  onClose,
}: {
  open: boolean;
  date: string;
  meal: Meal;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const refreshDiary = useRefreshDiary();
  const labelOf = useDayLabel();
  const [toDate, setToDate] = useState(() => addDays(date, 1));
  const [toMeal, setToMeal] = useState(meal);
  const copy = useMutation(
    trpc.diary.copyMeal.mutationOptions({
      onSuccess: async (copies, { toDate, toMeal }) => {
        await refreshDiary();
        toast.success(
          `Copied ${entriesCount(copies.length)} to ${mealName(toMeal)}, ${labelOf(toDate)}`,
        );
        onClose();
      },
    }),
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isDate(toDate)) {
      copy.mutate({ fromDate: date, meal, toDate, toMeal });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Copy {mealName(meal)}</DialogTitle>
          <DialogDescription>
            Its entries are added to the date and meal you choose.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {copy.isError ? <FormError>{copyFailed}</FormError> : null}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Date"
              type="date"
              required
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
            <SelectField
              label="Meal"
              value={toMeal}
              onChange={(event) => setToMeal(event.target.value as Meal)}
            >
              {meals.map((option) => (
                <option key={option} value={option}>
                  {mealNames[option]}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-11"
            disabled={copy.isPending}
          >
            {copy.isPending ? 'Copying…' : 'Copy'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClearDialog({
  open,
  date,
  meal,
  count,
  onClose,
}: {
  open: boolean;
  date: string;
  meal: Meal;
  count: number;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const refreshDiary = useRefreshDiary();
  const clear = useMutation(
    trpc.diary.clearMeal.mutationOptions({
      onSuccess: async () => {
        await refreshDiary();
        onClose();
      },
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            Clear {mealName(meal)}?
          </DialogTitle>
          <DialogDescription>
            This deletes its {entriesCount(count)}.
          </DialogDescription>
        </DialogHeader>
        {clear.isError ? <FormError>{clearFailed}</FormError> : null}
        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="h-11"
            disabled={clear.isPending}
            onClick={() => clear.mutate({ date, meal })}
          >
            {clear.isPending ? 'Clearing…' : 'Clear meal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MealMenu({
  date,
  meal,
  count,
}: {
  date: string;
  meal: Meal;
  count: number;
}) {
  const trpc = useTRPC();
  const refreshDiary = useRefreshDiary();
  const [dialog, setDialog] = useState<'copy-to' | 'clear' | null>(null);
  const copyFromYesterday = useMutation(
    trpc.diary.copyMeal.mutationOptions({
      onSuccess: async (copies) => {
        if (copies.length === 0) {
          toast.info(`Nothing to copy: yesterday’s ${mealName(meal)} is empty`);
          return;
        }
        await refreshDiary();
        toast.success(
          `Copied ${entriesCount(copies.length)} from yesterday’s ${mealName(meal)}`,
        );
      },
      onError: () => toast.error(copyFailed),
    }),
  );
  const close = () => setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="size-11" />}
        >
          <IconDots className="size-5" />
          <span className="sr-only">{mealNames[meal]} options</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            disabled={copyFromYesterday.isPending}
            onClick={() =>
              copyFromYesterday.mutate({
                fromDate: addDays(date, -1),
                meal,
                toDate: date,
                toMeal: meal,
              })
            }
          >
            <IconCopyPlus />
            Copy from yesterday
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={count === 0}
            onClick={() => setDialog('copy-to')}
          >
            <IconCopy />
            Copy to…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={count === 0}
            onClick={() => setDialog('clear')}
          >
            <IconTrash />
            Clear meal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'copy-to' ? (
        <CopyToDialog open date={date} meal={meal} onClose={close} />
      ) : null}
      {dialog === 'clear' ? (
        <ClearDialog
          open
          date={date}
          meal={meal}
          count={count}
          onClose={close}
        />
      ) : null}
    </>
  );
}
