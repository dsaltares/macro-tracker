'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/client';
import { routes } from '@/lib/routes';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    await signOut();
    router.replace(routes.signIn);
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={onSignOut}
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
