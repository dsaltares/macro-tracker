'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import {
  maxWeightKg,
  minWeightKg,
  weightKgSchema,
} from '@/lib/domain/body/measurements';
import { useTRPC } from '@/lib/trpc/client';

export const saveFailed = 'Your weight could not be saved. Try again.';

export const futureDate = 'You can only log a weight for today or earlier.';

const weightEntrySchemaOn = (today: string) =>
  z.object({
    date: z.iso
      .date({ error: 'Enter the day.' })
      .refine((date) => date <= today, futureDate),
    weightKg: weightKgSchema,
  });

type WeightEntry = z.infer<ReturnType<typeof weightEntrySchemaOn>>;

export function WeightForm({
  today,
  pickDate,
  hint,
}: {
  today: string;
  pickDate: boolean;
  hint?: string | undefined;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const log = useMutation(
    trpc.body.log.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.body.pathKey() }),
    }),
  );
  const [interactive, setInteractive] = useState(false);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<WeightEntry>({
    resolver: zodResolver(weightEntrySchemaOn(today)),
    defaultValues: { date: today },
    mode: 'onTouched',
  });

  useEffect(() => {
    setInteractive(true);
  }, []);

  const onSubmit = handleSubmit(({ date, weightKg }) =>
    log.mutate(
      { date, metric: 'weight_kg', value: weightKg },
      { onSuccess: () => resetField('weightKg') },
    ),
  );

  return (
    <form
      className="flex flex-col gap-2"
      method="post"
      onSubmit={onSubmit}
      noValidate
    >
      {log.isError ? <FormError>{saveFailed}</FormError> : null}
      {pickDate ? (
        <TextField
          label="Day"
          type="date"
          max={today}
          error={errors.date?.message}
          {...register('date')}
        />
      ) : null}
      <TextField
        label="Weight (kg)"
        type="number"
        inputMode="decimal"
        min={minWeightKg}
        max={maxWeightKg}
        step="any"
        error={errors.weightKg?.message}
        hint={hint}
        {...register('weightKg', { valueAsNumber: true })}
      />
      <Button
        type="submit"
        size="lg"
        disabled={!interactive || log.isPending}
        className={submitButtonClass}
      >
        {log.isPending ? 'Logging…' : 'Log weight'}
      </Button>
    </form>
  );
}
