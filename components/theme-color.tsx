'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { appBackground } from '@/lib/brand';

type AppTheme = keyof typeof appBackground;

const isAppTheme = (theme: string | undefined): theme is AppTheme =>
  theme !== undefined && Object.hasOwn(appBackground, theme);

export function ThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isAppTheme(resolvedTheme)) {
      return;
    }
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', appBackground[resolvedTheme].hex);
    }
  }, [resolvedTheme]);

  return null;
}
