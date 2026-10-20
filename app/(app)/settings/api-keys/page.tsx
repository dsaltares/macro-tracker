import type { Metadata } from 'next';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = { title: 'API keys' };

export default function ApiKeysPage() {
  return (
    <SettingsPage title="API keys">
      <ApiKeysSettings />
    </SettingsPage>
  );
}
