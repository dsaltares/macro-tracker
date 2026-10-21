'use client';

import { IconAlertTriangle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { type ComponentProps, type ReactNode, useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type FieldProps = ComponentProps<'input'> & {
  label: string;
  error?: string | undefined;
  warning?: string | undefined;
  hint?: string | undefined;
};

export function TextField({
  label,
  error,
  warning,
  hint,
  trailing,
  aside,
  hideLabel = false,
  className,
  ...input
}: FieldProps & {
  trailing?: ReactNode;
  aside?: string | undefined;
  hideLabel?: boolean;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const asideId = `${id}-aside`;
  const describedBy = [
    ...(aside ? [asideId] : []),
    ...(error || warning || hint ? [messageId] : []),
  ].join(' ');

  return (
    <div className="flex flex-col gap-2">
      {aside ? (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          <span
            id={asideId}
            className="truncate text-right text-muted-foreground text-xs"
          >
            {aside}
          </span>
        </div>
      ) : (
        <Label htmlFor={id} className={cn(hideLabel && 'sr-only')}>
          {label}
        </Label>
      )}
      <div className="relative">
        <Input
          id={id}
          className={cn(
            'h-11 text-base',
            trailing && 'pr-12',
            warning && !error && 'border-amber-500 bg-amber-500/5',
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          {...input}
        />
        {trailing}
      </div>
      <div className="min-h-4">
        {error ? (
          <p id={messageId} className="text-destructive text-xs">
            {error}
          </p>
        ) : warning ? (
          <p
            id={messageId}
            className="text-amber-700 text-xs dark:text-amber-400"
          >
            {warning}
          </p>
        ) : hint ? (
          <p id={messageId} className="text-muted-foreground text-xs">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PasswordField(props: FieldProps) {
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? IconEyeOff : IconEye;

  return (
    <TextField
      type={revealed ? 'text' : 'password'}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setRevealed(!revealed)}
        >
          <Icon className="size-4" />
          <span className="sr-only">
            {revealed ? 'Hide password' : 'Show password'}
          </span>
        </Button>
      }
      {...props}
    />
  );
}

export function CheckboxField({
  label,
  error,
  checked,
  onCheckedChange,
  onBlur,
}: {
  label: ReactNode;
  error?: string | undefined;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBlur?: () => void;
}) {
  const id = useId();
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-2">
      <Label className="items-start gap-3 font-normal text-sm leading-snug">
        <Checkbox
          className="mt-0.5"
          checked={checked}
          onCheckedChange={onCheckedChange}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error ? messageId : undefined}
        />
        <span>{label}</span>
      </Label>
      {error ? (
        <p id={messageId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children: string }) {
  return (
    <Alert variant="destructive">
      <IconAlertTriangle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
