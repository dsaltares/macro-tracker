import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignOutButton } from '@/components/account/sign-out-button';
import { signOut } from '@/test/auth-client';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

describe('SignOutButton', () => {
  it('signs out and goes to sign in', async () => {
    const { user } = renderUi(<SignOutButton />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/sign-in');
  });
});
