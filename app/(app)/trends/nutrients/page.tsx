import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { NutrientReport } from '@/components/nutrients/nutrient-report';
import { routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'Nutrient report' };

export default function NutrientReportPage() {
  return (
    <AppPage
      title="Nutrient report"
      start={<BackLink href={routes.trends} label="Back to trends" />}
    >
      <NutrientReport />
    </AppPage>
  );
}
