'use client';

import { AppPage } from '@/components/app-shell/app-page';
import { Button } from '@/components/ui/button';

export function PageError({ retry }: { retry: () => void }) {
  return (
    <AppPage title="Something went wrong">
      <p role="alert" className="text-muted-foreground text-sm">
        This page could not be loaded. Try again, or come back in a moment.
      </p>
      <Button size="lg" className="h-11 w-fit px-4" onClick={retry}>
        Try again
      </Button>
    </AppPage>
  );
}
