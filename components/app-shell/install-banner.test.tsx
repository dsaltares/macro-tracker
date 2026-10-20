import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallBanner } from '@/components/app-shell/install-banner';
import { installBannerDismissedKey, standaloneQuery } from '@/lib/install';
import { renderUi } from '@/test/ui';

const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const android =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const mac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const on = (userAgent: string, maxTouchPoints = 5) => {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true,
  });
};

const alreadyInstalled = () => {
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === standaloneQuery
      ? ({ matches: true } as MediaQueryList)
      : matchMedia(query),
  );
};

const banner = () =>
  screen.queryByRole('region', { name: 'Install Macro Tracker' });

beforeEach(() => {
  localStorage.clear();
  on(iphone);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallBanner', () => {
  it('points an iPhone at the share sheet', () => {
    renderUi(<InstallBanner />);

    expect(banner()).toHaveTextContent(
      'Tap the Share button, then Add to Home Screen.',
    );
  });

  it('points Android at the browser menu', () => {
    on(android);

    renderUi(<InstallBanner />);

    expect(banner()).toHaveTextContent(
      'Open the browser menu, then Install app.',
    );
  });

  it('says nothing on a desktop', () => {
    on(mac, 0);

    renderUi(<InstallBanner />);

    expect(banner()).toBeNull();
  });

  it('says nothing inside the installed app', () => {
    alreadyInstalled();

    renderUi(<InstallBanner />);

    expect(banner()).toBeNull();
  });

  it('stays gone once dismissed', async () => {
    const { user, unmount } = renderUi(<InstallBanner />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(banner()).toBeNull();
    expect(localStorage.getItem(installBannerDismissedKey)).not.toBeNull();

    unmount();
    renderUi(<InstallBanner />);

    expect(banner()).toBeNull();
  });
});
