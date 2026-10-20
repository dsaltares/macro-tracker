import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { OnboardingPage } from '@/components/onboarding/onboarding-page';
import { OnboardingForm } from '@/components/profile/onboarding-form';
import { afterAuthPath, nextParam } from '@/lib/auth/redirect';
import {
  onlyParam,
  requireSession,
  type SearchParams,
} from '@/lib/auth/session';
import { getDatabase } from '@/lib/db/client';
import { findProfile } from '@/lib/db/profiles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'About you' };

export default async function ProfileStepPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user } = await requireSession();
  if (await findProfile(getDatabase(), user.id)) {
    redirect(afterAuthPath(onlyParam((await searchParams)[nextParam])));
  }
  return (
    <OnboardingPage
      title="About you"
      description="Your energy target and the reference values for vitamins and minerals are worked out from these. You can change them later in your profile."
    >
      <Suspense>
        <OnboardingForm />
      </Suspense>
    </OnboardingPage>
  );
}
