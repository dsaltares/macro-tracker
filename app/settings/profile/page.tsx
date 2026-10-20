import type { Metadata } from 'next';
import { ProfileSettingsForm } from '@/components/profile/profile-settings-form';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const { user, profile } = await requireProfile(routes.profile);
  return (
    <SettingsPage email={user.email} title="Profile">
      <ProfileSettingsForm profile={profile} />
    </SettingsPage>
  );
}
