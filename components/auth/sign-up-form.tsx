'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AuthForm, AuthLink } from '@/components/auth/auth-form';
import {
  CheckboxField,
  PasswordField,
  TextField,
} from '@/components/auth/fields';
import { signUp } from '@/lib/auth/client';
import {
  displayNameFor,
  passwordHint,
  type SignUpCredentials,
  signUpSchema,
} from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import { authUrl, emailParam, nextParam } from '@/lib/auth/redirect';
import { privacyPolicy, terms } from '@/lib/navigation';
import { routes } from '@/lib/routes';

function Consent() {
  return (
    <>
      I agree to the terms and conditions and acknowledge the privacy policy: my
      food diary and weight are health data, stored for me to track them.{' '}
      <AuthLink href={terms.href} newTab>
        Terms
      </AuthLink>{' '}
      ·{' '}
      <AuthLink href={privacyPolicy.href} newTab>
        Privacy
      </AuthLink>
    </>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);
  const [failure, setFailure] = useState<string>();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpCredentials>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false,
    },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async ({ email, password, termsAccepted }) => {
    setFailure(undefined);

    const { error } = await signUp.email({
      email,
      password,
      name: displayNameFor(email),
      termsAccepted,
      callbackURL: authUrl(routes.verify, next),
    });
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }

    router.push(authUrl(routes.verify, next, { [emailParam]: email }));
  });

  return (
    <AuthForm
      onSubmit={onSubmit}
      error={failure}
      submit="Create account"
      working="Creating your account…"
      pending={isSubmitting}
      next={next}
      footer={{
        prompt: 'Already have an account?',
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
        error={errors.email?.message}
        {...register('email')}
      />
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
      <Controller
        control={control}
        name="termsAccepted"
        render={({ field, fieldState }) => (
          <CheckboxField
            label={<Consent />}
            checked={field.value}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
    </AuthForm>
  );
}
