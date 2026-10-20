'use client';

import {
  IconArrowLeft,
  IconCamera,
  IconPhoto,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { FormError, TextField } from '@/components/auth/fields';
import {
  PhotoInput,
  photoUnusable,
  UploadProgress,
} from '@/components/label-scan/label-capture';
import { shrinkPhoto } from '@/components/label-scan/photo';
import {
  type EstimateError,
  requestMealEstimate,
} from '@/components/meal-estimate/estimate';
import { Button } from '@/components/ui/button';
import {
  type MealDraft,
  maxMealDescriptionLength,
  maxMealPhotos,
} from '@/lib/domain/diary/meal-estimate';

export const mealCapturePrompt =
  'Take or choose up to four photos of the meal, from above and in good light.';

export const descriptionHint = 'two eggs, sourdough, butter, latte';

export const estimateErrorMessages: Record<EstimateError, string> = {
  UNAUTHORIZED: 'Your session has ended. Sign in again to estimate a meal.',
  MEAL_ESTIMATES_OFF: 'Meal estimates are off on this server.',
  PHOTO_TOO_LARGE:
    'A photo is too large to send. Remove it or choose another one.',
  UNSUPPORTED_PHOTO:
    'A photo could not be sent as an image. Remove it or choose another one.',
  INVALID_REQUEST:
    'The meal could not be sent. Check the photos and the description.',
  unreadable:
    'The meal could not be made out. Try again, or add a photo or a description.',
  rejected: 'The meal could not be estimated. Take or choose other photos.',
  'rate-limited':
    'Too many meals are being estimated. Wait a moment and try again.',
  unavailable: 'Meal estimates are unavailable right now. Try again.',
  offline: 'The photos could not be sent. Check your connection and try again.',
};

const retriable: ReadonlySet<EstimateError> = new Set([
  'unreadable',
  'rate-limited',
  'unavailable',
  'offline',
]);

export type MealPhoto = { id: number; blob: Blob; url: string };

type EstimateState =
  | { step: 'choosing'; unusable: boolean }
  | { step: 'preparing' }
  | { step: 'uploading'; sent: number }
  | { step: 'estimating' }
  | { step: 'failed'; error: EstimateError };

let photoIds = 0;

const photoOf = (blob: Blob): MealPhoto => ({
  id: ++photoIds,
  blob,
  url: URL.createObjectURL(blob),
});

function Thumbnails({
  photos,
  disabled,
  onRemove,
}: {
  photos: readonly MealPhoto[];
  disabled: boolean;
  onRemove: (photo: MealPhoto) => void;
}) {
  return (
    <ul aria-label="Photos" className="grid grid-cols-4 gap-2">
      {photos.map((photo, index) => (
        <li key={photo.id} className="relative aspect-square">
          {/* biome-ignore lint/performance/noImgElement: a local object URL that next/image cannot optimise */}
          <img
            src={photo.url}
            alt={`The meal, ${index + 1} of ${photos.length}`}
            className="size-full rounded-md object-cover"
          />
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1 right-1 size-7 rounded-full"
            aria-label={`Remove photo ${index + 1}`}
            disabled={disabled}
            onClick={() => onRemove(photo)}
          >
            <IconX className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function MealPhotoStep({
  photos,
  onPhotosChange,
  description,
  onDescriptionChange,
  onBack,
  onEstimated,
}: {
  photos: readonly MealPhoto[];
  onPhotosChange: (photos: MealPhoto[]) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  onBack: () => void;
  onEstimated: (draft: MealDraft) => void;
}) {
  const [state, setState] = useState<EstimateState>({
    step: 'choosing',
    unusable: false,
  });
  const busy =
    state.step === 'preparing' ||
    state.step === 'uploading' ||
    state.step === 'estimating';
  const room = maxMealPhotos - photos.length;

  const add = async (originals: File[]) => {
    setState({ step: 'preparing' });
    const shrunk = await Promise.all(
      originals
        .slice(0, room)
        .map((original) => shrinkPhoto(original).catch(() => null)),
    );
    const usable = shrunk.filter((photo): photo is Blob => photo !== null);
    onPhotosChange([...photos, ...usable.map(photoOf)]);
    setState({ step: 'choosing', unusable: usable.length < shrunk.length });
  };

  const remove = (removed: MealPhoto) => {
    URL.revokeObjectURL(removed.url);
    onPhotosChange(photos.filter(({ id }) => id !== removed.id));
  };

  const estimate = async () => {
    setState({ step: 'uploading', sent: 0 });
    const result = await requestMealEstimate(
      { photos: photos.map(({ blob }) => blob), description },
      (sent) =>
        setState(
          sent < 1 ? { step: 'uploading', sent } : { step: 'estimating' },
        ),
    );
    if (result.estimated) {
      onEstimated(result.draft);
    } else {
      setState({ step: 'failed', error: result.error });
    }
  };

  const failed = state.step === 'failed' ? state.error : null;

  return (
    <section
      aria-label="Estimate a meal"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        disabled={busy}
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      {photos.length === 0 ? (
        <p className="text-muted-foreground text-sm">{mealCapturePrompt}</p>
      ) : (
        <Thumbnails photos={photos} disabled={busy} onRemove={remove} />
      )}
      {state.step === 'choosing' && state.unusable ? (
        <FormError>{photoUnusable}</FormError>
      ) : null}
      {room > 0 && !busy ? (
        <div className="grid grid-cols-2 gap-2">
          <PhotoInput
            label="Take a photo"
            icon={IconCamera}
            capture="environment"
            primary={photos.length === 0}
            onPhotos={(originals) => void add(originals)}
          />
          <PhotoInput
            label="Choose photos"
            icon={IconPhoto}
            multiple
            primary={false}
            onPhotos={(originals) => void add(originals)}
          />
        </div>
      ) : null}
      <TextField
        label="Description"
        hint={`Optional, for example: ${descriptionHint}`}
        placeholder={descriptionHint}
        autoComplete="off"
        maxLength={maxMealDescriptionLength}
        disabled={busy}
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
      />
      {failed === null ? null : (
        <FormError>{estimateErrorMessages[failed]}</FormError>
      )}
      {state.step === 'preparing' ? (
        <p role="status" className="text-center text-muted-foreground text-sm">
          Preparing the photos…
        </p>
      ) : null}
      {state.step === 'uploading' ? (
        <UploadProgress sent={state.sent} label="Sending the photos" />
      ) : null}
      {state.step === 'estimating' ? (
        <p role="status" className="text-center text-muted-foreground text-sm">
          Looking at your meal…
        </p>
      ) : null}
      {busy ? null : (
        <Button
          size="lg"
          className="h-11"
          disabled={photos.length === 0}
          onClick={() => void estimate()}
        >
          {failed !== null && retriable.has(failed) ? 'Try again' : 'Estimate'}
        </Button>
      )}
    </section>
  );
}
