import { expect, test } from '@playwright/test';
import { appBackground, siteName, siteShortName } from '../lib/brand.ts';
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
