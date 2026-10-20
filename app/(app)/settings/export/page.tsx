import type { Metadata } from 'next';
import { ExportSettings } from '@/components/settings/export-settings';
import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = { title: 'Export' };

export default function ExportPage() {
  return (
    <SettingsPage title="Export">
      <ExportSettings />
    </SettingsPage>
  );
}
