import type { Metadata } from 'next';
import { AccountSummary } from '@/components/account/account-summary';
import { AppPage } from '@/components/app-shell/app-page';
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
      <div className="md:hidden">
        <AccountSummary account={user} />
      </div>
    </AppPage>
  );
}
