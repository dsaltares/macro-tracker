import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeColor } from '@/components/theme-color';
import { ThemeToggle } from '@/components/theme-toggle';
import { appBackground } from '@/lib/brand';
import { renderUi } from '@/test/ui';

const themeColors = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute('content'),
  );

beforeEach(() => {
  localStorage.clear();
  for (const scheme of ['light', 'dark'] as const) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = `(prefers-color-scheme: ${scheme})`;
    meta.content = appBackground[scheme].hex;
    document.head.append(meta);
  }
});

afterEach(() => {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.remove();
  }
});

describe('ThemeColor', () => {
  it('paints the browser bars in the theme chosen over the system one', async () => {
    const { user } = renderUi(
      <>
        <ThemeColor />
        <ThemeToggle />
      </>,
    );
    const choose = async (theme: string) => {
      await user.click(screen.getByRole('button', { name: 'Change theme' }));
      await user.click(screen.getByRole('menuitem', { name: theme }));
    };

    await choose('Dark');
    expect(themeColors()).toEqual([
      appBackground.dark.hex,
      appBackground.dark.hex,
    ]);

    await choose('Light');
    expect(themeColors()).toEqual([
      appBackground.light.hex,
      appBackground.light.hex,
    ]);
  });
});
