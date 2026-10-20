import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '@/components/account/account-menu';
import { dataSourcesUrl, sourceCodeUrl } from '@/lib/navigation';
import { signOut } from '@/test/auth-client';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const account = { email: 'eater@example.test' };

describe('AccountMenu', () => {
  it('shows the first letter of the address without a picture', () => {
    renderUi(<AccountMenu account={account} />);

    expect(screen.getByText('E')).toBeInTheDocument();
  });

  it('links to every policy, the data sources and the code', async () => {
    const { user } = renderUi(<AccountMenu account={account} />);

    await user.click(screen.getByRole('button', { name: 'Account' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Privacy policy' }),
    ).toHaveAttribute('href', '/privacy');
    expect(
      screen.getByRole('menuitem', { name: 'Terms and conditions' }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('menuitem', { name: 'Cookie policy' }),
    ).toHaveAttribute('href', '/cookies');
    expect(
      screen.getByRole('menuitem', { name: 'Data sources' }),
    ).toHaveAttribute('href', dataSourcesUrl);
    expect(screen.getByRole('menuitem', { name: 'GitHub' })).toHaveAttribute(
      'href',
      sourceCodeUrl,
    );
  });

  it('signs out and goes to sign in', async () => {
    const { user } = renderUi(<AccountMenu account={account} />);

    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });
});
