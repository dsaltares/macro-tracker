'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileForm } from '@/components/profile/profile-form';
import { afterAuthPath, nextParam } from '@/lib/auth/redirect';

export function OnboardingForm() {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);

  return (
    <ProfileForm
      profile={null}
      submit="Continue"
      working="Saving…"
      onSaved={() => {
        router.replace(afterAuthPath(next));
        router.refresh();
      }}
    />
  );
}
