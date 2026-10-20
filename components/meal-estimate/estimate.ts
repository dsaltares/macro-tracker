import {
  errorOf,
  postWithProgress,
  type UploadProgress,
} from '@/components/label-scan/photo';
import type {
  MealDraft,
  PreviousEstimate,
} from '@/lib/domain/diary/meal-estimate';
import type { MealEstimateError } from '@/lib/meal-estimate/route';
import { routes } from '@/lib/routes';

export type EstimateError = MealEstimateError | 'offline';

export type EstimateResult =
  | { estimated: true; draft: MealDraft }
  | { estimated: false; error: EstimateError };

export type MealToEstimate = {
  photos: readonly Blob[];
  description: string;
  previous?: PreviousEstimate;
};

const extensions: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

const formOf = ({ photos, description, previous }: MealToEstimate) => {
  const form = new FormData();
  for (const [index, photo] of photos.entries()) {
    form.append(
      'photos',
      photo,
      `photo-${index + 1}.${extensions[photo.type] ?? 'jpg'}`,
    );
  }
  if (description.trim() !== '') {
    form.append('description', description.trim());
  }
  if (previous !== undefined) {
    form.append('previous', JSON.stringify(previous));
  }
  return form;
};

export const requestMealEstimate = async (
  meal: MealToEstimate,
  onProgress: UploadProgress,
): Promise<EstimateResult> => {
  const answer = await postWithProgress(
    routes.mealEstimate,
    formOf(meal),
    onProgress,
  );
  if (!answer.answered) {
    return { estimated: false, error: 'offline' };
  }
  return answer.ok
    ? { estimated: true, draft: answer.body as MealDraft }
    : { estimated: false, error: errorOf<EstimateError>(answer.body) };
};
