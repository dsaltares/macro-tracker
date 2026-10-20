import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/settings/delete-account';
import { SettingsPage } from '@/components/settings/settings-page';
import { SignInMethods } from '@/components/settings/sign-in-methods';
import { googleConfigured } from '@/lib/auth/google';
import { errorParam } from '@/lib/auth/redirect';
import {
  onlyParam,
  requireProfile,
  type SearchParams,
} from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user } = await requireProfile();
  const linkError = onlyParam((await searchParams)[errorParam]);
  return (
    <SettingsPage title="Account">
      <p className="text-sm">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <SignInMethods
        email={user.email}
        google={googleConfigured()}
        linkError={linkError}
      />
      <DeleteAccount email={user.email} />
    </SettingsPage>
  );
}
