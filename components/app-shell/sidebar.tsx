'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Account } from '@/components/account/account-avatar';
import { AccountMenu } from '@/components/account/account-menu';
import { AppLogo } from '@/components/app-shell/app-logo';
import { tabIcon } from '@/components/app-shell/tab-icons';
import { siteName } from '@/lib/brand';
import { appTabs, isActiveTab } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function Sidebar({ account }: { account: Account }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 border-r bg-background pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] md:flex">
      <Link
        href={routes.diary}
        className="flex items-center gap-3 px-6 font-semibold text-lg"
      >
        <AppLogo />
        {siteName}
      </Link>
      <nav aria-label="Main" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {appTabs.map((tab) => {
            const Icon = tabIcon(tab.href);
            const active = isActiveTab(pathname, tab);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-11 items-center gap-3 rounded-md px-3 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground',
                    active && 'bg-muted text-foreground',
                  )}
                >
                  <Icon className="size-5" stroke={active ? 2 : 1.5} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t px-3 pt-3">
        <AccountMenu account={account} />
      </div>
    </aside>
  );
}
