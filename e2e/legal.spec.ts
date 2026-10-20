import { expect, test } from '@playwright/test';
import { siteName } from '../lib/brand.ts';
import { legalDocuments } from '../lib/navigation.ts';

test('the home page footer links to every legal page, and each stands alone', async ({
  page,
  request,
}) => {
  for (const { href, label } of legalDocuments) {
    const served = await request.get(href);
    expect(served.status(), href).toBe(200);
    expect(await served.text(), href).toContain(label);

    await page.goto('/');
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: label })
      .click();

    await expect(page).toHaveURL(href);
    await expect(page).toHaveTitle(`${label} · ${siteName}`);
    await expect(
      page.getByRole('heading', { name: label, level: 1 }),
    ).toBeVisible();
  }
});
