import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/app-shell/sidebar';
import { signOut } from '@/test/auth-client';
import { atPathname, router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const email = 'eater@example.test';

describe('Sidebar', () => {
  it('marks the tab of a settings section as the current page', () => {
    atPathname('/settings/profile');
    renderUi(<Sidebar email={email} />);

    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { current: 'page' })).toHaveAccessibleName(
      'Settings',
    );
    expect(nav.getAllByRole('link')).toHaveLength(4);
  });

  it('names the account and signs out of it', async () => {
    atPathname('/diary');
    const { user } = renderUi(<Sidebar email={email} />);

    expect(screen.getByText(email)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });
});
