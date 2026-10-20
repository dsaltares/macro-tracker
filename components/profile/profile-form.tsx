'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { type Choice, ChoiceField } from '@/components/profile/choice-field';
import { Button } from '@/components/ui/button';
import { localDateOf } from '@/lib/domain/dates';
import {
  type ActivityLevel,
  maxHeightCm,
  minHeightCm,
  type Profile,
  profileSchemaOn,
  type Sex,
} from '@/lib/domain/profile';
import { useTRPC } from '@/lib/trpc/client';

const sexChoices: readonly Choice<Sex>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const activityChoices: readonly Choice<ActivityLevel>[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Desk job, little or no exercise',
  },
  { value: 'light', label: 'Light', description: 'Exercise 1–3 days a week' },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Exercise 3–5 days a week',
  },
  { value: 'active', label: 'Active', description: 'Exercise 6–7 days a week' },
  {
    value: 'very_active',
    label: 'Very active',
    description: 'Hard exercise every day, or a physical job',
  },
];

export const saveFailed = 'Your profile could not be saved. Try again.';

export function ProfileForm({
  profile,
  submit,
  working,
  onSaved,
}: {
  profile: Profile | null;
  submit: string;
  working: string;
  onSaved: (profile: Profile) => void;
}) {
  const trpc = useTRPC();
  const upsert = useMutation(trpc.profile.upsert.mutationOptions());
  const [interactive, setInteractive] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Profile>({
    resolver: zodResolver(profileSchemaOn(localDateOf(new Date()))),
    defaultValues: profile ?? {},
    mode: 'onTouched',
  });

  useEffect(() => {
    setInteractive(true);
  }, []);

  const onSubmit = handleSubmit((values) =>
    upsert.mutate(values, { onSuccess: onSaved }),
  );

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      onSubmit={onSubmit}
      noValidate
    >
      {upsert.isError ? <FormError>{saveFailed}</FormError> : null}
      <Controller
        control={control}
        name="sex"
        render={({ field, fieldState }) => (
          <ChoiceField
            label="Sex"
            choices={sexChoices}
            columns={2}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Date of birth"
        type="date"
        autoComplete="bday"
        error={errors.birthDate?.message}
        {...register('birthDate')}
      />
      <TextField
        label="Height (cm)"
        type="number"
        inputMode="decimal"
        min={minHeightCm}
        max={maxHeightCm}
        step="any"
        error={errors.heightCm?.message}
        {...register('heightCm', { valueAsNumber: true })}
      />
      <Controller
        control={control}
        name="activityLevel"
        render={({ field, fieldState }) => (
          <ChoiceField
            label="Activity level"
            choices={activityChoices}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button
        type="submit"
        size="lg"
        disabled={!interactive || upsert.isPending}
        className={submitButtonClass}
      >
        {upsert.isPending ? working : submit}
      </Button>
    </form>
  );
}
