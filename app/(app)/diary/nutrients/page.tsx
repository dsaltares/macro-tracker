import type { Metadata } from 'next';
import { NutrientPanel } from '@/components/nutrients/nutrient-panel';

export const metadata: Metadata = { title: 'Nutrients' };

export default function NutrientsPage() {
  return <NutrientPanel />;
}
