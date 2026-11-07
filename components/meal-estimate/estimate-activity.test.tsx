import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type Activity,
  EstimateActivity,
  noActivity,
  withProgress,
} from '@/components/meal-estimate/estimate-activity';
import type { MealEstimateProgress } from '@/lib/domain/diary/meal-estimate';

const activityAfter = (...progress: MealEstimateProgress[]): Activity =>
  progress.reduce(withProgress, noActivity);

const doneSoFar = () =>
  within(screen.getByRole('list', { name: 'Done so far' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('EstimateActivity', () => {
  it('says it is looking at the meal before the estimator says anything', () => {
    render(
      <EstimateActivity activity={noActivity} idle="Looking at your meal" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Looking at your meal…',
    );
    expect(
      screen.queryByRole('list', { name: 'Done so far' }),
    ).not.toBeInTheDocument();
  });

  it('shows what it is doing, its latest thinking and what it has done', () => {
    render(
      <EstimateActivity
        activity={activityAfter(
          { kind: 'thinking', text: 'A plate of eggs ' },
          { kind: 'thinking', text: 'on toast.' },
          { kind: 'searching', query: 'eggs' },
          { kind: 'reading', name: 'Egg, boiled' },
          { kind: 'thinking', text: '\n\nThe toast looks like sourdough.' },
          { kind: 'searching', query: 'sourdough' },
        )}
        idle="Looking at your meal"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Searching for “sourdough”…',
    );
    expect(
      screen.getByText('The toast looks like sourdough.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/A plate of eggs/)).not.toBeInTheDocument();
    expect(doneSoFar()).toEqual([
      'Searching for “eggs”',
      'Reading Egg, boiled',
    ]);
  });

  it('names the lines it double-checks, then that it is writing the estimate', () => {
    render(
      <EstimateActivity
        activity={activityAfter(
          { kind: 'answering' },
          { kind: 'checking', names: ['Butter', 'Dressing'] },
          { kind: 'answering' },
        )}
        idle="Revising the meal"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Writing the estimate…',
    );
    expect(doneSoFar()).toEqual([
      'Writing the estimate',
      'Double-checking Butter, Dressing',
    ]);
  });
});
