import { AppHeader } from '@/components/app-header';
import { ServerStatus } from '@/components/server-status';
import { requireProfile } from '@/lib/auth/session';
import { siteDescription, siteName } from '@/lib/brand';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { user } = await requireProfile(routes.home);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <AppHeader email={user.email} />
      <h1 className="sr-only">{siteName}</h1>
      <p className="text-muted-foreground">{siteDescription}</p>
      <p>
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <ServerStatus />
    </main>
  );
}
