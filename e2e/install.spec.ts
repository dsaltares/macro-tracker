import { expect, test } from '@playwright/test';
import { appBackground, siteName, siteShortName } from '../lib/brand.ts';
import { splashScreens } from '../lib/splash.ts';
import { signInAsDevUser } from './auth.ts';

test('the manifest installs the app onto the diary', async ({
  page,
  request,
}) => {
  await page.goto('/sign-in');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    /manifest\.webmanifest/,
  );

  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.id).toBe('/');
  expect(manifest.name).toBe(siteName);
  expect(manifest.short_name).toBe(siteShortName);
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/diary');
  expect(manifest.scope).toBe('/');
  expect(manifest.theme_color).toBe(appBackground.dark.hex);
  expect(manifest.background_color).toBe(appBackground.dark.hex);

  for (const { src } of manifest.icons) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type'], src).toContain('image/');
  }
});

test('every iPhone and iPad has a splash screen of its exact size', async ({
  page,
  request,
}) => {
  await page.goto('/sign-in');

  const links = page.locator('link[rel="apple-touch-startup-image"]');
  await expect(links).toHaveCount(splashScreens.length);

  for (const href of await links.evaluateAll((all) =>
    all.map((link) => link.getAttribute('href') ?? ''),
  )) {
    const splash = await request.get(href);
    expect(splash.status(), href).toBe(200);
    expect(splash.headers()['content-type'], href).toBe('image/png');
  }
  expect((await request.get('/splash/1x1')).status()).toBe(404);
});

test.describe('on a first launch in the browser', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a phone is told how to install, until it says no', async ({
    page,
    isMobile,
  }) => {
    await signInAsDevUser(page);
    const banner = page.getByRole('region', { name: `Install ${siteName}` });

    if (!isMobile) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(banner).toBeHidden();
      return;
    }

    await expect(banner).toContainText(
      'Open the browser menu, then Install app',
    );
    await banner.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(banner).toBeHidden();
  });
});

test('no service worker is registered', async ({ page }) => {
  await signInAsDevUser(page);
  await page.reload();

  expect(
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).map(
        ({ scope }) => scope,
      ),
    ),
  ).toEqual([]);
});

test('every page carries the security headers', async ({ request }) => {
  for (const path of ['/sign-in', '/manifest.webmanifest']) {
    const headers = (await request.get(path)).headers();

    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['referrer-policy'], path).toBe(
      'strict-origin-when-cross-origin',
    );
  }
});
