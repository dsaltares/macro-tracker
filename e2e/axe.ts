import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const blockingImpacts = new Set(['serious', 'critical']);

const animationsSettled = (page: Page) =>
  page.evaluate(async () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));
    const running = () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !==
              Number.POSITIVE_INFINITY,
        );
    for (;;) {
      await nextFrame();
      await nextFrame();
      const animations = running();
      if (animations.length === 0) {
        return;
      }
      await Promise.allSettled(
        animations.map((animation) => animation.finished),
      );
    }
  });

export const expectNoSeriousViolations = async (page: Page) => {
  await animationsSettled(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations
    .filter(({ impact }) => impact && blockingImpacts.has(impact))
    .map(({ id, help, nodes }) => ({
      id,
      help,
      nodes: nodes.map(({ html, failureSummary }) => ({
        html,
        failureSummary,
      })),
    }));
  expect(blocking).toEqual([]);
};
