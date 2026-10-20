import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppHeader } from '@/components/app-header';
import { OnboardingForm } from '@/components/profile/onboarding-form';
import { afterAuthPath, nextParam } from '@/lib/auth/redirect';
import {
  onlyParam,
  requireSession,
  type SearchParams,
} from '@/lib/auth/session';
import { getDatabase } from '@/lib/db/client';
import { findProfile } from '@/lib/db/profiles';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'About you' };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user } = await requireSession(routes.onboarding);
  if (await findProfile(getDatabase(), user.id)) {
    redirect(afterAuthPath(onlyParam((await searchParams)[nextParam])));
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <AppHeader email={user.email} />
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">About you</h1>
        <p className="text-muted-foreground text-sm">
          Your energy target and the reference values for vitamins and minerals
          are worked out from these. You can change them later in your profile.
        </p>
      </div>
      <Suspense>
        <OnboardingForm />
      </Suspense>
    </main>
  );
}
