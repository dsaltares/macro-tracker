'use client';

import { IconDeviceMobilePlus, IconX } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { siteName } from '@/lib/brand';
import {
  type InstallPlatform,
  installBannerDismissedKey,
  installPlatform,
  standaloneQuery,
} from '@/lib/install';

const howToInstall = {
  ios: 'Tap the Share button, then Add to Home Screen.',
  android:
    'Open the browser menu, then Install app. Some browsers call it Add to Home Screen.',
} as const satisfies Record<InstallPlatform, string>;

const wasDismissed = () => {
  try {
    return localStorage.getItem(installBannerDismissedKey) !== null;
  } catch {
    return false;
  }
};

const rememberDismissal = () => {
  try {
    localStorage.setItem(installBannerDismissedKey, 'true');
  } catch {}
};

export function InstallBanner() {
  const headingId = useId();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    if (window.matchMedia(standaloneQuery).matches || wasDismissed()) {
      return;
    }
    setPlatform(installPlatform(navigator));
  }, []);

  if (!platform) {
    return null;
  }

  const dismiss = () => {
    rememberDismissal();
    setPlatform(null);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mx-4 mb-4 flex items-start gap-3 rounded-lg border bg-background p-4 pr-1 shadow-lg md:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <IconDeviceMobilePlus className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={headingId} className="font-semibold text-sm">
          Install {siteName}
        </h2>
        <p className="text-muted-foreground text-sm">
          {howToInstall[platform]} It opens full screen from then on, without
          the browser bars in the way.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-mt-3 size-11"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <IconX className="size-4" />
      </Button>
    </section>
  );
}
