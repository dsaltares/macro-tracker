import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/settings/delete-account';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const { user } = await requireProfile(routes.account);
  return (
    <SettingsPage email={user.email} title="Account">
      <p className="text-sm">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <DeleteAccount email={user.email} />
    </SettingsPage>
  );
}
