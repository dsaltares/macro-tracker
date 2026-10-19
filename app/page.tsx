import { ServerStatus } from '@/components/server-status';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteDescription, siteName } from '@/lib/brand';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">{siteName}</h1>
        <ThemeToggle />
      </header>
      <p className="text-muted-foreground">{siteDescription}</p>
      <ServerStatus />
    </main>
  );
}
