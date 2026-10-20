'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconCheck, IconLinkOff } from '@tabler/icons-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthForm, AuthOutcome } from '@/components/auth/auth-form';
import { PasswordField } from '@/components/auth/fields';
import { resetPassword } from '@/lib/auth/client';
import {
  type NewPassword,
  newPasswordSchema,
  passwordHint,
} from '@/lib/auth/credentials';
import { authErrorMessage, resetLinkExpired } from '@/lib/auth/errors';
import { errorParam } from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

const invalidToken = 'INVALID_TOKEN';

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token');
  const [spent, setSpent] = useState(!token || !!params.get(errorParam));
  const [changed, setChanged] = useState(false);
  const [failure, setFailure] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPassword>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFailure(undefined);

    const { error } = await resetPassword({
      newPassword: password,
      token: token ?? '',
    });
    if (error?.code === invalidToken) {
      setSpent(true);
      return;
    }
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }

    setChanged(true);
  });

  if (spent) {
    return (
      <AuthOutcome
        icon={<IconLinkOff />}
        title="That link no longer works"
        link={{ href: routes.forgotPassword, label: 'Ask for a new link' }}
      >
        {resetLinkExpired}
      </AuthOutcome>
    );
  }

  if (changed) {
    return (
      <AuthOutcome
        icon={<IconCheck />}
        title="Your password is changed"
        link={{ href: routes.signIn, label: 'Sign in' }}
      >
        Every session that was signed in with the old password has been signed
        out. Sign in again with the new one.
      </AuthOutcome>
    );
  }

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Save new password"
      working="Saving…"
      pending={isSubmitting}
      next={null}
      footer={{
        prompt: 'Remembered the old one?',
        href: routes.signIn,
        label: 'Sign in',
      }}
    >
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint={passwordHint}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Repeat password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
    </AuthForm>
  );
}
