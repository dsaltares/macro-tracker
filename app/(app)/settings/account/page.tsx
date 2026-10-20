import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/settings/delete-account';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const { user } = await requireProfile();
  return (
    <SettingsPage title="Account">
      <p className="text-sm">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <DeleteAccount email={user.email} />
    </SettingsPage>
  );
}
