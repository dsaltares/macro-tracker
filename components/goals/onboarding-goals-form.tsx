'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { GoalSettingsForm } from '@/components/goals/goal-settings-form';
import { afterAuthPath, nextParam } from '@/lib/auth/redirect';
import type { Profile } from '@/lib/domain/profile';

export function OnboardingGoalsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const next = useSearchParams().get(nextParam);

  return (
    <GoalSettingsForm
      profile={profile}
      submit="Continue"
      working="Saving…"
      onSaved={() => router.replace(afterAuthPath(next))}
    />
  );
}
