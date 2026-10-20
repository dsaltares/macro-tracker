'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconBrandGoogle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, PasswordField } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import { linkSocial } from '@/lib/auth/client';
import {
  type NewPassword,
  newPasswordSchema,
  passwordHint,
} from '@/lib/auth/credentials';
import { authErrorMessage, googleLinkErrorMessage } from '@/lib/auth/errors';
import type { SignInMethod } from '@/lib/db/sign-in-methods';
import { routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

export const loadFailed = 'Your sign-in methods could not be loaded.';

const methodNames: Record<SignInMethod, string> = {
  password: 'Password',
  google: 'Google',
};

function MethodRow({
  method,
  connected,
  detail,
  onlyMethod,
  disconnecting,
  onDisconnect,
  children,
}: {
  method: SignInMethod;
  connected: boolean;
  detail?: string | undefined;
  onlyMethod: boolean;
  disconnecting: boolean;
  onDisconnect: () => void;
  children?: ReactNode;
}) {
  const nameId = useId();
  const name = methodNames[method];

  return (
    <li aria-labelledby={nameId} className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={nameId} className="font-medium">
          {name}
        </span>
        <span className="text-muted-foreground text-sm">
          {connected ? 'Connected' : 'Not connected'}
        </span>
        {detail ? (
          <span className="truncate text-muted-foreground text-xs">
            {detail}
          </span>
        ) : null}
        {onlyMethod ? (
          <span className="text-muted-foreground text-xs">
            Your only way to sign in
          </span>
        ) : null}
      </div>
      {connected ? (
        <Button
          variant="outline"
          disabled={onlyMethod || disconnecting}
          onClick={onDisconnect}
        >
          Disconnect
          <span className="sr-only"> {name}</span>
        </Button>
      ) : (
        children
      )}
    </li>
  );
}

function ConnectGoogle() {
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setFailure(undefined);
    setPending(true);
    const { error } = await linkSocial({
      provider: 'google',
      callbackURL: routes.account,
      errorCallbackURL: routes.account,
    });
    if (error) {
      setPending(false);
      setFailure(authErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {failure ? <FormError>{failure}</FormError> : null}
      <Button variant="outline" disabled={pending} onClick={onClick}>
        <IconBrandGoogle />
        {pending ? 'Going to Google…' : 'Connect Google'}
      </Button>
    </div>
  );
}

function SetPassword({ onSet }: { onSet: () => Promise<void> }) {
  const trpc = useTRPC();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewPassword>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  });
  const save = useMutation(
    trpc.account.setPassword.mutationOptions({
      onSuccess: async () => {
        reset();
        await onSet();
      },
    }),
  );

  return (
    <form
      aria-labelledby="set-password"
      className="flex flex-col gap-2"
      method="post"
      noValidate
      onSubmit={handleSubmit((password) => save.mutate(password))}
    >
      <h3 id="set-password" className="font-semibold">
        Set a password
      </h3>
      <p className="text-muted-foreground text-sm">
        Then you can also sign in with this address and the password.
      </p>
      {save.isError ? <FormError>{failureOf(save.error)}</FormError> : null}
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
      <Button
        type="submit"
        size="lg"
        disabled={save.isPending}
        className={submitButtonClass}
      >
        {save.isPending ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  );
}

export function SignInMethods({
  email,
  google,
  linkError,
}: {
  email: string;
  google: boolean;
  linkError?: string | undefined;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const methods = useQuery(trpc.account.signInMethods.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.account.signInMethods.queryKey(),
    });
  const disconnect = useMutation(
    trpc.account.disconnect.mutationOptions({ onSuccess: refresh }),
  );

  const content = () => {
    if (methods.isPending) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    if (methods.isError) {
      return <FormError>{loadFailed}</FormError>;
    }
    const { password, google: withGoogle } = methods.data;
    const onlyMethod = Number(password) + Number(withGoogle) === 1;
    const row = (method: SignInMethod, connected: boolean) => ({
      method,
      connected,
      onlyMethod: connected && onlyMethod,
      disconnecting: disconnect.isPending,
      onDisconnect: () => disconnect.mutate({ method }),
    });
    return (
      <>
        {disconnect.isError ? (
          <FormError>{failureOf(disconnect.error)}</FormError>
        ) : null}
        <ul className="flex flex-col divide-y rounded-lg border">
          <MethodRow {...row('password', password)} />
          <MethodRow
            {...row('google', withGoogle)}
            detail={withGoogle ? email : undefined}
          >
            {google ? <ConnectGoogle /> : null}
          </MethodRow>
        </ul>
        {password ? null : <SetPassword onSet={refresh} />}
      </>
    );
  };

  return (
    <section aria-labelledby="sign-in-methods" className="flex flex-col gap-4">
      <h2 id="sign-in-methods" className="font-semibold text-lg">
        Sign-in methods
      </h2>
      {linkError ? (
        <FormError>{googleLinkErrorMessage(linkError)}</FormError>
      ) : null}
      {content()}
    </section>
  );
}
