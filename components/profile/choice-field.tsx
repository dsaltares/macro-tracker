'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type Choice<V extends string> = {
  value: V;
  label: string;
  description?: string;
};

export function ChoiceField<V extends string>({
  label,
  choices,
  value,
  onValueChange,
  onBlur,
  error,
  columns = 1,
}: {
  label: string;
  choices: readonly Choice<V>[];
  value: V | undefined;
  onValueChange: (value: V) => void;
  onBlur?: () => void;
  error?: string | undefined;
  columns?: 1 | 2;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="font-medium text-xs/relaxed leading-none">
        {label}
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={error ? messageId : undefined}
        value={value ?? null}
        onValueChange={(chosen) => onValueChange(chosen as V)}
        className={cn('gap-2', columns === 2 && 'grid-cols-2')}
      >
        {choices.map((choice) => (
          <Label
            key={choice.value}
            className="min-h-11 cursor-pointer gap-3 rounded-md border px-3 py-2 font-normal has-data-checked:border-primary"
          >
            <RadioGroupItem
              value={choice.value}
              onBlur={onBlur}
              aria-invalid={!!error}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{choice.label}</span>
              {choice.description ? (
                <span className="text-muted-foreground text-xs">
                  {choice.description}
                </span>
              ) : null}
            </span>
          </Label>
        ))}
      </RadioGroup>
      {error ? (
        <p id={messageId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
