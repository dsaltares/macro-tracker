import type { Metadata } from 'next';
import { AppHeader } from '@/components/app-header';
import { SettingsList } from '@/components/settings/settings-list';
import { requireProfile } from '@/lib/auth/session';
import { settingsSections } from '@/lib/navigation';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user } = await requireProfile(routes.settings);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <AppHeader email={user.email} />
      <h1 className="font-semibold text-2xl">Settings</h1>
      <SettingsList sections={settingsSections} />
    </main>
  );
}
