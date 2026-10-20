import type { Metadata } from 'next';
import { DiaryDay } from '@/components/diary/diary-day';

export const metadata: Metadata = { title: 'Diary' };

export default function DiaryPage() {
  return <DiaryDay />;
}
