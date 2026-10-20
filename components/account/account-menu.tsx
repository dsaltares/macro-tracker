'use client';

import {
  IconExternalLink,
  IconLogout,
  IconSelector,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useState } from 'react';
import {
  type Account,
  AccountAvatar,
} from '@/components/account/account-avatar';
import { accountLinks } from '@/components/account/account-links';
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
import { routes } from '@/lib/routes';

const ExternalLink = (props: ComponentProps<'a'>) => (
  <a {...props} target="_blank" rel="noreferrer" />
);

export function AccountMenu({ account }: { account: Account }) {
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
        aria-label="Account"
        className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-muted"
      >
        <AccountAvatar account={account} />
        <span className="min-w-0 flex-1 truncate">{account.email}</span>
        <IconSelector className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            {account.email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {accountLinks.map(({ href, label, Icon, external }) => (
          <DropdownMenuItem
            key={href}
            render={
              external ? <ExternalLink href={href} /> : <Link href={href} />
            }
          >
            <Icon />
            {label}
            {external ? (
              <IconExternalLink className="ml-auto text-muted-foreground" />
            ) : null}
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
