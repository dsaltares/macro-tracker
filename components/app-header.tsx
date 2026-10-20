import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link href={routes.home} className="font-semibold text-2xl">
        {siteName}
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AccountMenu email={email} />
      </div>
    </header>
  );
}
