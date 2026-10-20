'use client';

import { IconCamera, IconPhoto } from '@tabler/icons-react';
import { type ChangeEvent, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import {
  type ScanError,
  shrinkPhoto,
  uploadPhoto,
} from '@/components/label-scan/photo';
import { Button, buttonVariants } from '@/components/ui/button';
import type { LabelReading } from '@/lib/domain/foods/label-reading';
import { cn } from '@/lib/utils';

export const capturePrompt =
  'Take a photo of the nutrition table, straight on and in good light.';

export const photoUnusable =
  'This photo could not be opened. Take or choose another one.';

export const scanErrorMessages: Record<ScanError, string> = {
  UNAUTHORIZED: 'Your session has ended. Sign in again to scan a label.',
  LABEL_SCANNING_OFF: 'Label scanning is off on this server.',
  PHOTO_TOO_LARGE:
    'The photo is too large to send. Take or choose another one.',
  UNSUPPORTED_PHOTO:
    'The photo could not be sent as an image. Take or choose another one.',
  unreadable:
    'The label could not be read. Try again, or take a sharper photo of the table.',
  rejected: 'The label could not be read. Take or choose another photo.',
  'rate-limited':
    'Too many labels are being read. Wait a moment and try again.',
  unavailable: 'Label reading is unavailable right now. Try again.',
  offline: 'The photo could not be sent. Check your connection and try again.',
};

const retriable: ReadonlySet<ScanError> = new Set([
  'unreadable',
  'rate-limited',
  'unavailable',
  'offline',
]);

type CaptureState =
  | { step: 'choosing' }
  | { step: 'preparing' }
  | { step: 'uploading'; photo: Blob; sent: number }
  | { step: 'reading'; photo: Blob }
  | { step: 'unusable' }
  | { step: 'failed'; photo: Blob; error: ScanError };

const percent = (share: number) => Math.round(share * 100);

function PhotoInput({
  label,
  icon: Icon,
  capture,
  primary,
  onPhoto,
}: {
  label: string;
  icon: typeof IconCamera;
  capture?: 'environment';
  primary: boolean;
  onPhoto: (photo: File) => void;
}) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const [photo] = event.target.files ?? [];
    event.target.value = '';
    if (photo !== undefined) {
      onPhoto(photo);
    }
  };

  return (
    <label
      className={cn(
        buttonVariants({
          variant: primary ? 'default' : 'outline',
          size: 'lg',
        }),
        'h-11 cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <Icon className="size-5" />
      {label}
      <input
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        onChange={onChange}
      />
    </label>
  );
}

function UploadProgress({ sent }: { sent: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Sending the photo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent(sent)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${percent(sent)}%` }}
        />
      </div>
      <p role="status" className="text-center text-muted-foreground text-sm">
        Sending the photo…
      </p>
    </div>
  );
}

export function LabelCapture({
  onRead,
}: {
  onRead: (reading: LabelReading) => void;
}) {
  const [state, setState] = useState<CaptureState>({ step: 'choosing' });

  const send = async (photo: Blob) => {
    setState({ step: 'uploading', photo, sent: 0 });
    const result = await uploadPhoto(photo, (sent) =>
      setState(
        sent < 1
          ? { step: 'uploading', photo, sent }
          : { step: 'reading', photo },
      ),
    );
    if (result.read) {
      onRead(result.reading);
    } else {
      setState({ step: 'failed', photo, error: result.error });
    }
  };

  const scan = async (original: File) => {
    setState({ step: 'preparing' });
    const photo = await shrinkPhoto(original).catch(() => null);
    if (photo === null) {
      setState({ step: 'unusable' });
      return;
    }
    await send(photo);
  };

  const choosing =
    state.step === 'choosing' ||
    state.step === 'unusable' ||
    state.step === 'failed';

  return (
    <section aria-label="Scan a label" className="flex flex-col gap-3">
      {state.step === 'choosing' ? (
        <p className="text-muted-foreground text-sm">{capturePrompt}</p>
      ) : null}
      {state.step === 'unusable' ? (
        <FormError>{photoUnusable}</FormError>
      ) : null}
      {state.step === 'failed' ? (
        <>
          <FormError>{scanErrorMessages[state.error]}</FormError>
          {retriable.has(state.error) ? (
            <Button
              size="lg"
              className="h-11"
              onClick={() => void send(state.photo)}
            >
              Try again
            </Button>
          ) : null}
        </>
      ) : null}
      {state.step === 'preparing' ? (
        <p role="status" className="text-center text-muted-foreground text-sm">
          Preparing the photo…
        </p>
      ) : null}
      {state.step === 'uploading' ? <UploadProgress sent={state.sent} /> : null}
      {state.step === 'reading' ? (
        <p role="status" className="text-center text-muted-foreground text-sm">
          Reading the label…
        </p>
      ) : null}
      {choosing ? (
        <>
          <PhotoInput
            label="Take a photo"
            icon={IconCamera}
            capture="environment"
            primary={state.step !== 'failed' || !retriable.has(state.error)}
            onPhoto={(photo) => void scan(photo)}
          />
          <PhotoInput
            label="Choose a photo"
            icon={IconPhoto}
            primary={false}
            onPhoto={(photo) => void scan(photo)}
          />
        </>
      ) : null}
    </section>
  );
}
