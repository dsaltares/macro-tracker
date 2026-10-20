'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileForm } from '@/components/profile/profile-form';
import { authUrl, nextParam } from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

export function OnboardingForm() {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);

  return (
    <ProfileForm
      profile={null}
      submit="Continue"
      working="Saving…"
      onSaved={() => router.replace(authUrl(routes.onboardingGoals, next))}
    />
  );
}
