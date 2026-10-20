import { IconChevronRight, IconExternalLink } from '@tabler/icons-react';
import Link from 'next/link';
import {
  type Account,
  AccountAvatar,
} from '@/components/account/account-avatar';
import { accountLinks } from '@/components/account/account-links';
import { SignOutButton } from '@/components/account/sign-out-button';

const rowClass =
  'flex min-h-11 items-center justify-between gap-4 px-4 text-sm hover:bg-muted';

export function AccountSummary({ account }: { account: Account }) {
  return (
    <section aria-label="Your account" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <AccountAvatar account={account} className="size-10" />
        <p className="min-w-0 truncate font-medium text-sm">{account.email}</p>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {accountLinks.map(({ href, label, Icon, external }) => {
          const content = (
            <>
              <span className="flex items-center gap-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </span>
              {external ? (
                <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </>
          );
          return (
            <li key={href}>
              {external ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={rowClass}
                >
                  {content}
                </a>
              ) : (
                <Link href={href} className={rowClass}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <SignOutButton variant="outline" size="lg" className="h-11 w-full" />
    </section>
  );
}
