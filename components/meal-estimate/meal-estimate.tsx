'use client';

import { useEffect, useRef, useState } from 'react';
import { MealDraftReview } from '@/components/meal-estimate/meal-draft-review';
import {
  type MealPhoto,
  MealPhotoStep,
} from '@/components/meal-estimate/meal-photo-step';
import type { Meal } from '@/lib/domain/diary/entries';
import {
  type DraftChange,
  draftChanges,
  type MealDraft,
  maxFeedbackRounds,
} from '@/lib/domain/diary/meal-estimate';

type Reviewed = {
  version: number;
  draft: MealDraft;
  revised: { changes: DraftChange[]; previous: MealDraft } | null;
};

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
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [rounds, setRounds] = useState(0);
  useRevokedOnUnmount(photos);

  const review = (draft: MealDraft, revised: Reviewed['revised'] = null) =>
    setReviewed((last) => ({
      version: (last?.version ?? 0) + 1,
      draft,
      revised,
    }));

  if (reviewed !== null) {
    const { revised } = reviewed;
    return (
      <MealDraftReview
        key={reviewed.version}
        draft={reviewed.draft}
        revision={
          revised === null
            ? null
            : {
                changes: revised.changes,
                onUndo: () => review(revised.previous),
              }
        }
        feedback={{
          photos,
          description,
          roundsLeft: maxFeedbackRounds - rounds,
          onRevised: (previous, draft) => {
            setRounds((spent) => spent + 1);
            review(draft, {
              changes: draftChanges(previous, draft),
              previous,
            });
          },
        }}
        date={date}
        meal={meal}
        onBack={() => setReviewed(null)}
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
      onEstimated={(draft) => review(draft)}
    />
  );
}
