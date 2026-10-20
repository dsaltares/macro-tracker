'use client';

import {
  IconChartLine,
  IconNotebook,
  IconSettings,
  IconToolsKitchen2,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appTabs, isActiveTab } from '@/lib/navigation';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

const tabIcons: Record<string, typeof IconNotebook> = {
  [routes.diary]: IconNotebook,
  [routes.foods]: IconToolsKitchen2,
  [routes.trends]: IconChartLine,
  [routes.settings]: IconSettings,
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
        {appTabs.map((tab) => {
          const Icon = tabIcons[tab.href] ?? IconNotebook;
          const active = isActiveTab(pathname, tab);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground',
                  active && 'text-foreground',
                )}
              >
                <Icon className="size-6" stroke={active ? 2 : 1.5} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
