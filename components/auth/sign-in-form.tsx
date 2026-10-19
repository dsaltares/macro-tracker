'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthForm, AuthLink } from '@/components/auth/auth-form';
import { PasswordField, TextField } from '@/components/auth/fields';
import { signIn } from '@/lib/auth/client';
import { type SignInCredentials, signInSchema } from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import {
  afterAuthPath,
  authUrl,
  emailParam,
  nextParam,
} from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

const unverified = 'EMAIL_NOT_VERIFIED';

export function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);
  const [failure, setFailure] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInCredentials>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (credentials) => {
    setFailure(undefined);

    const { error } = await signIn.email(credentials);
    if (error?.code === unverified) {
      router.push(
        authUrl(routes.verify, next, { [emailParam]: credentials.email }),
      );
      return;
    }
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }

    router.replace(afterAuthPath(next));
    router.refresh();
  });

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Sign in"
      working="Signing in…"
      pending={isSubmitting}
      next={next}
      footer={{
        prompt: 'No account yet?',
        href: routes.signUp,
        label: 'Create one',
      }}
    >
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <p className="text-muted-foreground text-xs">
        <AuthLink href={routes.forgotPassword}>Forgot your password?</AuthLink>
      </p>
    </AuthForm>
  );
}
