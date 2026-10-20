'use client';

import { IconLogout } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth/client';
import { routes } from '@/lib/routes';

export function SignOutButton(
  props: Omit<ComponentProps<typeof Button>, 'onClick' | 'disabled'>,
) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    await signOut();
    router.replace(routes.signIn);
    router.refresh();
  };

  return (
    <Button disabled={pending} onClick={onSignOut} {...props}>
      <IconLogout />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
