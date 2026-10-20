import { AccountMenu } from '@/components/account-menu';
import { ServerStatus } from '@/components/server-status';
import { ThemeToggle } from '@/components/theme-toggle';
import { requireSession } from '@/lib/auth/session';
import { siteDescription, siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { user } = await requireSession(routes.home);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">{siteName}</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu email={user.email} />
        </div>
      </header>
      <p className="text-muted-foreground">{siteDescription}</p>
      <p>
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <ServerStatus />
    </main>
  );
}
