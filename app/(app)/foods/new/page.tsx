import type { Metadata } from 'next';
import { AppPage } from '@/components/app-shell/app-page';
import { BackLink } from '@/components/app-shell/back-link';
import { NewUserFood } from '@/components/foods/user-food-editor';
import { getLabelReader } from '@/lib/ai/server';
import { isDate } from '@/lib/domain/dates';
import { type Meal, meals } from '@/lib/domain/diary/entries';
import { type DiaryMeal, diaryHref, routes } from '@/lib/routes';

export const metadata: Metadata = { title: 'New food' };

const isMeal = (meal: unknown): meal is Meal =>
  meals.some((known) => known === meal);

const diaryMealOf = (date: unknown, meal: unknown): DiaryMeal | null =>
  typeof date === 'string' && isDate(date) && isMeal(meal)
    ? { date, meal }
    : null;

export default async function NewFoodPage({
  searchParams,
}: {
  searchParams: Promise<{
    barcode?: string | string[];
    scan?: string | string[];
    date?: string | string[];
    meal?: string | string[];
  }>;
}) {
  const { barcode, scan, date, meal } = await searchParams;
  const diary = diaryMealOf(date, meal);
  return (
    <AppPage
      title="New food"
      start={
        diary === null ? (
          <BackLink href={routes.foods} label="Back to foods" />
        ) : (
          <BackLink href={diaryHref(diary.date)} label="Back to the diary" />
        )
      }
    >
      <NewUserFood
        barcode={typeof barcode === 'string' ? barcode : ''}
        diary={diary}
        labelScanning={getLabelReader() !== null}
        scanFirst={scan === 'label'}
      />
    </AppPage>
  );
}
