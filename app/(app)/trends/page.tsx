import { IconChevronRight, IconScale } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppPage } from '@/components/app-shell/app-page';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Trends' };

export default function TrendsPage() {
  return (
    <AppPage title="Trends">
      <Link
        href={routes.body}
        className="flex min-h-16 items-center justify-between gap-4 rounded-lg border px-4 py-3 hover:bg-muted"
      >
        <span className="flex items-center gap-4">
          <IconScale className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Weight</span>
            <span className="text-muted-foreground text-sm">
              Every weight you logged, day by day
            </span>
          </span>
        </span>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <p className="text-muted-foreground text-sm">
        How your intake changes over weeks and months will be here.
      </p>
    </AppPage>
  );
}
