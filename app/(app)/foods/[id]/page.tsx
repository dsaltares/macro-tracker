import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { EditUserFood } from '@/components/foods/user-food-editor';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Edit food' };

export default async function EditFoodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppPage
      title="Edit food"
      start={<BackLink href={routes.foods} label="Back to foods" />}
    >
      <EditUserFood foodId={id} />
    </AppPage>
  );
}
