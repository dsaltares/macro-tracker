import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { NewUserFood } from '@/components/foods/user-food-editor';
import { getLabelReader } from '@/lib/ai/server';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'New food' };

export default async function NewFoodPage({
  searchParams,
}: {
  searchParams: Promise<{
    barcode?: string | string[];
    scan?: string | string[];
  }>;
}) {
  const { barcode, scan } = await searchParams;
  return (
    <AppPage
      title="New food"
      start={<BackLink href={routes.foods} label="Back to foods" />}
    >
      <NewUserFood
        barcode={typeof barcode === 'string' ? barcode : ''}
        labelScanning={getLabelReader() !== null}
        scanFirst={scan === 'label'}
      />
    </AppPage>
  );
}
