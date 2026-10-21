import type { Metadata } from 'next';
import { ImportSettings } from '@/components/settings/import-settings';
import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = { title: 'Import' };

export default function ImportPage() {
  return (
    <SettingsPage title="Import">
      <ImportSettings />
    </SettingsPage>
  );
}
