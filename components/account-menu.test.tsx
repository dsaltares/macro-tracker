import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '@/components/account-menu';
import { signOut } from '@/test/auth-client';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const email = 'eater@example.test';

describe('AccountMenu', () => {
  it('names the account and links to the privacy policy and the terms', async () => {
    const { user } = renderUi(<AccountMenu email={email} />);

    await user.click(screen.getByRole('button', { name: 'Account' }));

    expect(await screen.findByText(email)).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Privacy policy' }),
    ).toHaveAttribute('href', '/privacy');
    expect(
      screen.getByRole('menuitem', { name: 'Terms and conditions' }),
    ).toHaveAttribute('href', '/terms');
  });

  it('signs out and goes to sign in', async () => {
    const { user } = renderUi(<AccountMenu email={email} />);

    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });
});
