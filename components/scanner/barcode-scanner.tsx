'use client';

import { IconBolt, IconBoltOff } from '@tabler/icons-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { createBarcodeDetector } from '@/components/scanner/detector';
import { Button } from '@/components/ui/button';

export const scanPrompt = 'Point the camera at a barcode.';

export const cameraDenied =
  'Camera access is blocked. Allow it in your browser’s site settings to scan barcodes.';

export const noCamera = 'This device has no camera to scan with.';

export const cameraFailed = 'The camera could not be started. Try again.';

export const scanIntervalMs = 150;

export const readsToConfirm = 2;

type ScannerState = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'failed';

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

const errorMessages = {
  denied: cameraDenied,
  'no-camera': noCamera,
  failed: cameraFailed,
} as const;

const deniedErrors = new Set(['NotAllowedError', 'SecurityError']);

const missingCameraErrors = new Set(['NotFoundError', 'OverconstrainedError']);

const stateOfCameraError = (error: unknown): ScannerState => {
  const name = error instanceof DOMException ? error.name : '';
  if (deniedErrors.has(name)) {
    return 'denied';
  }
  if (missingCameraErrors.has(name)) {
    return 'no-camera';
  }
  return 'failed';
};

const cameraConstraints: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' } },
  audio: false,
};

const stopStream = (stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

const supportsTorch = (
  track: MediaStreamTrack | undefined,
): track is MediaStreamTrack =>
  (track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch === true;

const codeConfirmation = () => {
  let lastRead: string | null = null;
  let reads = 0;
  let confirmed: string | null = null;
  return (code: string | null) => {
    reads = code !== null && code === lastRead ? reads + 1 : 1;
    lastRead = code;
    if (code === null || code === confirmed || reads < readsToConfirm) {
      return null;
    }
    confirmed = code;
    return code;
  };
};

function TorchToggle({ track }: { track: MediaStreamTrack }) {
  const [on, setOn] = useState(false);
  const Icon = on ? IconBoltOff : IconBolt;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="absolute right-3 bottom-3 size-11"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        track
          .applyConstraints({
            advanced: [{ torch: next } as MediaTrackConstraintSet],
          })
          .then(
            () => setOn(next),
            () => {},
          );
      }}
    >
      <Icon className="size-5" />
      <span className="sr-only">Torch</span>
    </Button>
  );
}

export function BarcodeScanner({
  onDetected,
}: {
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>('starting');
  const [torch, setTorch] = useState<MediaStreamTrack | null>(null);
  const detected = useEffectEvent(onDetected);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const confirm = codeConfirmation();

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('no-camera');
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
      const video = videoRef.current;
      if (stopped || video === null) {
        stopStream(stream);
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const detector = await createBarcodeDetector();
      if (stopped) {
        return;
      }
      const [track] = stream.getVideoTracks();
      setTorch(supportsTorch(track) ? track : null);
      setState('scanning');

      const scan = async () => {
        const codes = await detector.detect(video).catch(() => []);
        if (stopped) {
          return;
        }
        const code = confirm(codes[0]?.rawValue ?? null);
        if (code !== null) {
          detected(code);
        }
        timer = setTimeout(scan, scanIntervalMs);
      };
      void scan();
    };

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      if (stream !== null) {
        stopStream(stream);
      }
    };

    start().catch((error: unknown) => {
      if (!stopped) {
        setState(stream === null ? stateOfCameraError(error) : 'failed');
      }
      stop();
    });

    return stop;
  }, []);

  if (state === 'denied' || state === 'no-camera' || state === 'failed') {
    return <FormError>{errorMessages[state]}</FormError>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          aria-label="Camera"
          className="size-full object-cover"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80" />
        {torch === null ? null : <TorchToggle track={torch} />}
      </div>
      <p role="status" className="text-center text-muted-foreground text-sm">
        {state === 'scanning' ? scanPrompt : 'Starting the camera…'}
      </p>
    </div>
  );
}
