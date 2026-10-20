'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/client';
import { routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

const sameAddress = (typed: string, email: string) =>
  typed.trim().toLowerCase() === email.toLowerCase();

export function DeleteAccount({ email }: { email: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [interactive, setInteractive] = useState(false);
  const remove = useMutation(
    trpc.account.delete.mutationOptions({
      onSuccess: async () => {
        await signOut();
        router.replace(routes.signIn);
        router.refresh();
      },
    }),
  );
  const working = remove.isPending || remove.isSuccess;

  useEffect(() => {
    setInteractive(true);
  }, []);

  return (
    <section
      aria-labelledby="delete-account"
      className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4"
    >
      <h2 id="delete-account" className="font-semibold text-lg">
        Delete your account
      </h2>
      <p className="text-sm">
        This deletes your account, your profile, your sign-in and every food,
        portion and preference you saved, at once, and signs you out. It cannot
        be undone.
      </p>
      {remove.isError ? <FormError>{failureOf(remove.error)}</FormError> : null}
      <form
        className="flex flex-col gap-2"
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          remove.mutate({ email: typed });
        }}
      >
        <TextField
          label="Type your email address to confirm"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={!interactive || working}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button
          type="submit"
          variant="destructive"
          size="lg"
          disabled={!sameAddress(typed, email) || working}
          className={submitButtonClass}
        >
          {working ? 'Deleting…' : 'Delete account'}
        </Button>
      </form>
    </section>
  );
}
