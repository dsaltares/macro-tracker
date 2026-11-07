import {
  errorOf,
  postWithProgress,
  type UploadProgress,
} from '@/components/label-scan/photo';
import type {
  MealDraft,
  MealEstimateProgress,
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

const parsed = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

const isProgress = (
  line: unknown,
): line is { progress: MealEstimateProgress } =>
  typeof line === 'object' && line !== null && 'progress' in line;

// The route answers newline-delimited JSON: progress lines, blank keep-alives, and a last line
// with the draft or the error. A refusal before the stream starts (401, 413…) is one JSON value.
// Each call takes the text so far, hands on each progress line it has not seen, and keeps the
// last other value as the answer.
const lineReader = (onEstimating: (progress: MealEstimateProgress) => void) => {
  let read = 0;
  let answer: unknown;
  const take = (line: string) => {
    if (line.trim() === '') {
      return;
    }
    const value = parsed(line);
    if (isProgress(value)) {
      onEstimating(value.progress);
    } else {
      answer = value;
    }
  };
  return {
    onText: (text: string) => {
      const end = text.lastIndexOf('\n') + 1;
      if (end > read) {
        for (const line of text.slice(read, end).split('\n')) {
          take(line);
        }
        read = end;
      }
    },
    answer: (text: string) => {
      take(text.slice(read));
      read = text.length;
      return answer as { draft?: MealDraft; error?: string } | undefined;
    },
  };
};

export const requestMealEstimate = async (
  meal: MealToEstimate,
  onProgress: UploadProgress,
  onEstimating: (progress: MealEstimateProgress) => void = () => {},
): Promise<EstimateResult> => {
  const reader = lineReader(onEstimating);
  let text = '';
  const answer = await postWithProgress(
    routes.mealEstimate,
    formOf(meal),
    onProgress,
    (sofar) => {
      text = sofar;
      reader.onText(sofar);
    },
  );
  if (!answer.answered) {
    return { estimated: false, error: 'offline' };
  }
  const last = reader.answer(text);
  // The route answers 200 as soon as the photos are valid and streams the estimate after, so a
  // failure of the estimator comes as `{ error }` with that 200.
  return answer.ok && last?.draft !== undefined
    ? { estimated: true, draft: last.draft }
    : { estimated: false, error: errorOf<EstimateError>(last) };
};
