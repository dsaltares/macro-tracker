import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { SettingsList } from '@/components/settings/settings-list';
import { ThemeSetting } from '@/components/settings/theme-setting';
import { requireProfile } from '@/lib/auth/session';
import { settingsSections } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user } = await requireProfile();
  return (
    <AppPage title="Settings">
      <SettingsList sections={settingsSections} />
      <section aria-labelledby="appearance" className="flex flex-col gap-3">
        <h2 id="appearance" className="font-semibold text-lg">
          Appearance
        </h2>
        <ThemeSetting />
      </section>
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
        <SignOutButton
          variant="outline"
          size="lg"
          className="h-11 w-fit px-4"
        />
      </div>
    </AppPage>
  );
}
