import type { Metadata } from 'next';
import { AppHeader } from '@/components/app-header';
import { ProfileSettingsForm } from '@/components/profile/profile-settings-form';
import { requireProfile } from '@/lib/auth/session';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const { user, profile } = await requireProfile(routes.profile);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <AppHeader email={user.email} />
      <h1 className="font-semibold text-2xl">Profile</h1>
      <ProfileSettingsForm profile={profile} />
    </main>
  );
}
