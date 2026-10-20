import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSummary } from '@/components/account/account-summary';
import { dataSourcesUrl, sourceCodeUrl } from '@/lib/navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

describe('AccountSummary', () => {
  it('names the account, links to every policy, the data sources and the code, and signs out', () => {
    renderUi(<AccountSummary account={{ email: 'eater@example.test' }} />);

    const summary = within(
      screen.getByRole('region', { name: 'Your account' }),
    );
    expect(summary.getByText('eater@example.test')).toBeInTheDocument();
    expect(
      summary
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Privacy policy', '/privacy'],
      ['Terms and conditions', '/terms'],
      ['Cookie policy', '/cookies'],
      ['Data sources', dataSourcesUrl],
      ['GitHub', sourceCodeUrl],
    ]);
    expect(summary.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});
