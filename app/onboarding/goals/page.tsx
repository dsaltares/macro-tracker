import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnboardingGoalsForm } from '@/components/goals/onboarding-goals-form';
import { OnboardingPage } from '@/components/onboarding/onboarding-page';
import { authUrl, nextParam } from '@/lib/auth/redirect';
import {
  onlyParam,
  requireSession,
  type SearchParams,
} from '@/lib/auth/session';
import { getDatabase } from '@/lib/db/client';
import { findProfile } from '@/lib/db/profiles';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your goals' };

export default async function GoalsStepPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user } = await requireSession();
  const profile = await findProfile(getDatabase(), user.id);
  if (!profile) {
    redirect(
      authUrl(routes.onboarding, onlyParam((await searchParams)[nextParam])),
    );
  }
  return (
    <OnboardingPage
      title="Your goals"
      description="These are the defaults for your profile. Change anything you like now, or later in settings."
    >
      <Suspense>
        <OnboardingGoalsForm profile={profile} />
      </Suspense>
    </OnboardingPage>
  );
}
