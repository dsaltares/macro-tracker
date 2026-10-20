import type { Metadata } from 'next';
import { FoodSourcesSettings } from '@/components/settings/food-sources-settings';
import { SettingsPage } from '@/components/settings/settings-page';
import { requireProfile } from '@/lib/auth/session';
import { routes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Food sources' };

export default async function FoodSourcesPage() {
  const { user } = await requireProfile(routes.foodSources);
  return (
    <SettingsPage email={user.email} title="Food sources">
      <FoodSourcesSettings />
    </SettingsPage>
  );
}
