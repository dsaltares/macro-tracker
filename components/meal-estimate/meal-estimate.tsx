'use client';

import { useEffect, useRef, useState } from 'react';
import { MealDraftReview } from '@/components/meal-estimate/meal-draft-review';
import {
  type MealPhoto,
  MealPhotoStep,
} from '@/components/meal-estimate/meal-photo-step';
import type { Meal } from '@/lib/domain/diary/entries';
import type { MealDraft } from '@/lib/domain/diary/meal-estimate';

function useRevokedOnUnmount(photos: readonly MealPhoto[]) {
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(
    () => () => {
      for (const { url } of latest.current) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );
}

export function MealEstimate({
  date,
  meal,
  onBack,
  onLogged,
}: {
  date: string;
  meal: Meal;
  onBack: () => void;
  onLogged: () => void;
}) {
  const [photos, setPhotos] = useState<MealPhoto[]>([]);
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<MealDraft | null>(null);
  useRevokedOnUnmount(photos);

  if (draft !== null) {
    return (
      <MealDraftReview
        draft={draft}
        date={date}
        meal={meal}
        onBack={() => setDraft(null)}
        onLogged={onLogged}
      />
    );
  }
  return (
    <MealPhotoStep
      photos={photos}
      onPhotosChange={setPhotos}
      description={description}
      onDescriptionChange={setDescription}
      onBack={onBack}
      onEstimated={setDraft}
    />
  );
}
