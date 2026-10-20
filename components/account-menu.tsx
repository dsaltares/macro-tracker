'use client';

import { IconLogout, IconUser, IconUserCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth/client';
import { privacyPolicy, terms } from '@/lib/navigation';
import { routes } from '@/lib/routes';

const accountMenuDocuments = [privacyPolicy, terms];

export function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    await signOut();
    router.replace(routes.signIn);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" className="size-11" />}
      >
        <IconUserCircle className="size-5" />
        <span className="sr-only">Account</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={routes.profile} />}>
          <IconUser />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {accountMenuDocuments.map(({ href, label }) => (
          <DropdownMenuItem key={href} render={<Link href={href} />}>
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={onSignOut}>
          <IconLogout />
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
