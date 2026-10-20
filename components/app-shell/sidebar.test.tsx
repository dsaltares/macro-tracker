import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/app-shell/sidebar';
import { atPathname } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const account = { email: 'eater@example.test' };

describe('Sidebar', () => {
  it('marks the tab of a settings section as the current page', () => {
    atPathname('/settings/profile');
    renderUi(<Sidebar account={account} />);

    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { current: 'page' })).toHaveAccessibleName(
      'Settings',
    );
    expect(nav.getAllByRole('link')).toHaveLength(4);
  });

  it('holds the account menu', () => {
    atPathname('/diary');
    renderUi(<Sidebar account={account} />);

    expect(screen.getByRole('button', { name: 'Account' })).toHaveTextContent(
      account.email,
    );
  });
});
