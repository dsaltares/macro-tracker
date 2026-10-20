import type { Metadata } from 'next';
import { DiaryDay } from '@/components/diary/diary-day';
import { getMealEstimator } from '@/lib/ai/server';

export const metadata: Metadata = { title: 'Diary' };

export default function DiaryPage() {
  return <DiaryDay mealEstimates={getMealEstimator() !== null} />;
}
