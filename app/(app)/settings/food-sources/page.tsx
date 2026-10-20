import type { Metadata } from 'next';
import { FoodSourcesSettings } from '@/components/settings/food-sources-settings';
import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = { title: 'Food sources' };

export default function FoodSourcesPage() {
  return (
    <SettingsPage title="Food sources">
      <FoodSourcesSettings />
    </SettingsPage>
  );
}
