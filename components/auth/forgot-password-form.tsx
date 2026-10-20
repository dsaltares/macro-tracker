'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconMail } from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthForm, AuthOutcome } from '@/components/auth/auth-form';
import { TextField } from '@/components/auth/fields';
import { requestPasswordReset } from '@/lib/auth/client';
import { type Address, addressSchema } from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import { routes } from '@/lib/routes';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string>();
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

    const { error } = await requestPasswordReset({
      email,
      redirectTo: routes.resetPassword,
    });
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }

    setSent(true);
  });

  if (sent) {
    return (
      <AuthOutcome
        icon={<IconMail />}
        title="Check your email"
        link={{ href: routes.signIn, label: 'Back to sign in' }}
      >
        If that address has an account, a link to choose a new password is on
        its way. The link expires in an hour and works once.
      </AuthOutcome>
    );
  }

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Email me a link"
      working="Sending…"
      pending={isSubmitting}
      next={null}
      footer={{
        prompt: 'Remembered it?',
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
