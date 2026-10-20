'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconMail } from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AuthForm,
  AuthOutcome,
  submitButtonClass,
} from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import { sendVerificationEmail } from '@/lib/auth/client';
import { type Address, addressSchema } from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import { authUrl } from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

const requestConfirmation = (email: string, next: string | null) =>
  sendVerificationEmail({ email, callbackURL: authUrl(routes.verify, next) });

function CheckYourInbox({
  email,
  next,
}: {
  email: string;
  next: string | null;
}) {
  const [failure, setFailure] = useState<string>();
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  const onResend = async () => {
    setFailure(undefined);
    setPending(true);
    const { error } = await requestConfirmation(email, next);
    setPending(false);
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }
    setResent(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {failure ? <FormError>{failure}</FormError> : null}
      <AuthOutcome
        icon={<IconMail />}
        title="Confirm your address to finish"
        link={{ href: authUrl(routes.signIn, next), label: 'Back to sign in' }}
        action={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={submitButtonClass}
            disabled={pending}
            onClick={onResend}
          >
            {pending ? 'Sending…' : 'Send it again'}
          </Button>
        }
      >
        We sent a link to{' '}
        <span className="font-medium text-foreground">{email}</span>. It expires
        in an hour and works once.
        {resent ? ' On its way — check your spam folder too.' : null}
      </AuthOutcome>
    </div>
  );
}

function AskForANewLink({
  error,
  next,
}: {
  error: string | undefined;
  next: string | null;
}) {
  const [sentTo, setSentTo] = useState<string>();
  const [failure, setFailure] = useState(error);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Address>({
    resolver: zodResolver(addressSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(undefined);
    const { error: refused } = await requestConfirmation(email, next);
    if (refused) {
      setFailure(authErrorMessage(refused));
      return;
    }
    setSentTo(email);
  });

  if (sentTo) {
    return <CheckYourInbox email={sentTo} next={next} />;
  }

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Send me a new link"
      working="Sending…"
      pending={isSubmitting}
      next={next}
      footer={{
        prompt: 'Already confirmed?',
        href: routes.signIn,
        label: 'Sign in',
      }}
    >
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        hint="The address you signed up with."
        error={errors.email?.message}
        {...register('email')}
      />
    </AuthForm>
  );
}

export function VerifyAddress({
  email,
  error,
  next,
}: {
  email: string | undefined;
  error: string | undefined;
  next: string | null;
}) {
  if (email && !error) {
    return <CheckYourInbox email={email} next={next} />;
  }
  return <AskForANewLink error={error} next={next} />;
}
