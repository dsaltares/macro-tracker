import type { Metadata } from 'next';
import { GoalsSettings } from '@/components/goals/goals-settings';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Goals' };

export default async function GoalsPage() {
  const { profile } = await requireProfile();
  return (
    <SettingsPage title="Goals">
      <GoalsSettings profile={profile} />
    </SettingsPage>
  );
}
