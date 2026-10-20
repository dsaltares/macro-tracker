import type { Metadata } from 'next';
import { ProfileSettingsForm } from '@/components/profile/profile-settings-form';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const { profile } = await requireProfile();
  return (
    <SettingsPage title="Profile">
      <ProfileSettingsForm profile={profile} />
    </SettingsPage>
  );
}
