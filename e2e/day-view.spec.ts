import { expect, type Page, test } from '@playwright/test';
import { addDays, localDateOf } from '../lib/domain/dates.ts';
import { signInAsDevUser } from './auth.ts';

const renderBudgetMs = 100;

const stepsTimed = 3;

type Step = { ms: number; showedSkeleton: boolean };

const prefetchOf = (page: Page, date: string) =>
  Promise.all(
    ['diary.day', 'goals.forDate'].map((procedure) =>
      page.waitForResponse((response) => {
        const url = decodeURIComponent(response.url());
        return url.includes(procedure) && url.includes(`"${date}"`);
      }),
    ),
  );

test('the day view steps to an adjacent day from cache in under 100 ms', async ({
  page,
}) => {
  const today = localDateOf(new Date());
  await signInAsDevUser(page);
  let prefetched = prefetchOf(page, addDays(today, -1));
  await page.goto('/diary');
  await expect(page.getByRole('region', { name: 'Breakfast' })).toBeVisible();

  const steps: Step[] = [];
  for (let step = 1; step <= stepsTimed; step++) {
    await prefetched;
    if (step < stepsTimed) {
      prefetched = prefetchOf(page, addDays(today, -step - 1));
    }
    steps.push(
      await page.evaluate(
        (date) =>
          new Promise<Step>((resolve) => {
            const loading = () =>
              document.querySelector('[role="status"][aria-label="Loading"]');
            const rendered = () =>
              document.querySelector<HTMLInputElement>('input[type="date"]')
                ?.value === date &&
              loading() === null &&
              [...document.querySelectorAll('h2')].some(
                (heading) => heading.textContent === 'Breakfast',
              );
            const previousDay = [...document.querySelectorAll('button')].find(
              (button) => button.textContent?.includes('Previous day'),
            );
            let showedSkeleton = false;
            const started = performance.now();
            const observer = new MutationObserver(() => {
              showedSkeleton ||= loading() !== null;
              if (rendered()) {
                observer.disconnect();
                requestAnimationFrame(() =>
                  resolve({ ms: performance.now() - started, showedSkeleton }),
                );
              }
            });
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
            });
            previousDay?.click();
          }),
        addDays(today, -step),
      ),
    );
  }

  test.info().annotations.push({
    type: 'day view render (ms)',
    description: steps.map(({ ms }) => ms.toFixed(1)).join(', '),
  });
  for (const { ms, showedSkeleton } of steps) {
    expect(showedSkeleton).toBe(false);
    expect(ms).toBeLessThan(renderBudgetMs);
  }
});
