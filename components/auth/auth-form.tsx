'use client';

import Link from 'next/link';
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { FormError } from '@/components/auth/fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authUrl } from '@/lib/auth/redirect';

export function AuthLink({
  href,
  newTab = false,
  children,
}: {
  href: string;
  newTab?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="font-medium text-foreground underline underline-offset-4"
    >
      {children}
    </Link>
  );
}

export function AuthOutcome({
  icon,
  title,
  children,
  link,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  link: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
      {action}
      <p className="text-muted-foreground text-xs">
        <AuthLink href={link.href}>{link.label}</AuthLink>
      </p>
    </div>
  );
}

export const submitButtonClass = 'h-11 text-sm';

export function AuthForm({
  onSubmit,
  error,
  submit,
  working,
  pending,
  footer,
  next,
  children,
}: {
  onSubmit: ComponentProps<'form'>['onSubmit'];
  error: string | undefined;
  submit: string;
  working: string;
  pending: boolean;
  footer: { prompt: string; href: string; label: string };
  next: string | null;
  children: ReactNode;
}) {
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setInteractive(true);
  }, []);

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      onSubmit={onSubmit}
      noValidate
    >
      {error ? <FormError>{error}</FormError> : null}
      {children}
      <Button
        type="submit"
        size="lg"
        disabled={!interactive || pending}
        className={submitButtonClass}
      >
        {pending ? working : submit}
      </Button>
      <p className="text-muted-foreground text-xs">
        {footer.prompt}{' '}
        <AuthLink href={authUrl(footer.href, next)}>{footer.label}</AuthLink>
      </p>
    </form>
  );
}
