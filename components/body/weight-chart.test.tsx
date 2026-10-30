import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeightChart } from '@/components/body/weight-chart';
import type { DatedWeight } from '@/lib/domain/body/trend';
import { renderUi } from '@/test/ui';

const today = '2026-10-20';

const weightsWithGaps: DatedWeight[] = [
  { date: '2026-10-15', value: 82 },
  { date: '2026-10-05', value: 79.1 },
  { date: '2026-10-02', value: 81 },
  { date: '2026-10-01', value: 80 },
];

const render = (weights: DatedWeight[]) =>
  renderUi(<WeightChart weights={weights} today={today} />);

const trend = () => screen.getByRole('region', { name: 'Trend' });

const shown = (term: string) =>
  within(trend())
    .getAllByRole('term')
    .find((candidate) => candidate.textContent === term)?.nextElementSibling
    ?.textContent;

describe('WeightChart', () => {
  it('summarises the weights and their trend for screen readers', () => {
    render(weightsWithGaps);

    expect(
      within(trend()).getByRole('figure', {
        name: 'From Thu, 1 Oct 2026 to Thu, 15 Oct 2026: 4 weights between 79.1 kg and 82 kg; the trend went from 80 kg to 81.2 kg.',
      }),
    ).toBeInTheDocument();
  });

  it('shows the trend weight and the weekly rate', () => {
    render(weightsWithGaps);

    expect(shown('Trend weight')).toBe('81.2 kg');
    expect(shown('Weekly rate')).toBe('+0.6 kg a week');
  });

  it('shows the last 90 days until another range is chosen', async () => {
    const { user } = render([
      { date: '2025-10-01', value: 90 },
      { date: '2026-06-01', value: 85 },
      ...weightsWithGaps,
    ]);

    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('figure')).toHaveAccessibleName(
      /^From Thu, 1 Oct 2026 to Thu, 15 Oct 2026: 4 weights/,
    );

    await user.click(screen.getByRole('button', { name: '1 year' }));
    expect(screen.getByRole('figure')).toHaveAccessibleName(
      /^From Mon, 1 Jun 2026 to Thu, 15 Oct 2026: 5 weights/,
    );

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('figure')).toHaveAccessibleName(
      /^From Wed, 1 Oct 2025 to Thu, 15 Oct 2026: 6 weights/,
    );

    await user.click(screen.getByRole('button', { name: '30 days' }));
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('figure')).toHaveAccessibleName(
      /^From Thu, 1 Oct 2026 to Thu, 15 Oct 2026: 4 weights/,
    );
  });

  it('keeps the trend of the weights before the range', async () => {
    const { user } = render([
      { date: '2026-09-14', value: 90 },
      { date: '2026-09-21', value: 80 },
    ]);

    await user.click(screen.getByRole('button', { name: '30 days' }));
    expect(shown('Trend weight')).toBe('84.8 kg');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(shown('Trend weight')).toBe('84.8 kg');
    expect(shown('Weekly rate')).toBe('-5.2 kg a week');
  });

  it('says when the range has no weights', async () => {
    const { user } = render([{ date: '2026-06-01', value: 85 }]);

    await user.click(screen.getByRole('button', { name: '30 days' }));

    expect(
      within(trend()).getByText('No weights in the last 30 days.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('waits for a week of weights before showing a weekly rate', () => {
    render([
      { date: '2026-10-14', value: 80 },
      { date: '2026-10-20', value: 79 },
    ]);

    expect(shown('Weekly rate')).toBe('Needs a week of weights');
  });

  it('counts a single weight', () => {
    render([{ date: '2026-10-20', value: 80 }]);

    expect(screen.getByRole('figure')).toHaveAccessibleName(
      'From Tue, 20 Oct 2026 to Tue, 20 Oct 2026: 1 weight between 80 kg and 80 kg; the trend went from 80 kg to 80 kg.',
    );
  });

  it('shows nothing without weights', () => {
    render([]);

    expect(screen.queryByRole('region', { name: 'Trend' })).toBeNull();
  });
});
