import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ExportSettings,
  rangeEndsBeforeItStarts,
} from '@/components/settings/export-settings';
import { renderUi } from '@/test/ui';

describe('ExportSettings', () => {
  it('downloads everything when no dates are chosen', () => {
    renderUi(<ExportSettings />);

    expect(screen.getByRole('link', { name: 'Diary (CSV)' })).toHaveAttribute(
      'href',
      '/api/export/diary.csv',
    );
    expect(screen.getByRole('link', { name: 'Weights (CSV)' })).toHaveAttribute(
      'href',
      '/api/export/weights.csv',
    );
    expect(
      screen.getByRole('link', { name: 'Everything (JSON)' }),
    ).toHaveAttribute('href', '/api/export/all.json');
  });

  it('downloads the diary and weights within the chosen dates', async () => {
    const { user } = renderUi(<ExportSettings />);

    await user.type(screen.getByLabelText('From'), '2026-10-01');
    expect(screen.getByRole('link', { name: 'Diary (CSV)' })).toHaveAttribute(
      'href',
      '/api/export/diary.csv?from=2026-10-01',
    );

    await user.type(screen.getByLabelText('To'), '2026-10-20');
    expect(screen.getByRole('link', { name: 'Diary (CSV)' })).toHaveAttribute(
      'href',
      '/api/export/diary.csv?from=2026-10-01&to=2026-10-20',
    );
    expect(screen.getByRole('link', { name: 'Weights (CSV)' })).toHaveAttribute(
      'href',
      '/api/export/weights.csv?from=2026-10-01&to=2026-10-20',
    );
    expect(
      screen.getByRole('link', { name: 'Everything (JSON)' }),
    ).toHaveAttribute('href', '/api/export/all.json');
  });

  it('refuses a range that ends before it starts', async () => {
    const { user } = renderUi(<ExportSettings />);

    await user.type(screen.getByLabelText('From'), '2026-10-20');
    await user.type(screen.getByLabelText('To'), '2026-10-01');

    expect(screen.getByText(rangeEndsBeforeItStarts)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diary (CSV)' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Weights (CSV)' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Everything (JSON)' }),
    ).toBeInTheDocument();
  });
});
