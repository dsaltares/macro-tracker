import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { resetLinkExpired } from '@/lib/auth/errors';
import { resetPassword } from '@/test/auth-client';
import { atSearchParams } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const password = 'beans-on-toast-every-day';

const choose = async (user: ReturnType<typeof renderUi>['user']) => {
  await user.type(screen.getByLabelText('Password'), password);
  await user.type(screen.getByLabelText('Repeat password'), password);
  await user.click(screen.getByRole('button', { name: 'Save new password' }));
};

beforeEach(() => {
  atSearchParams('?token=abc123');
  resetPassword.mockResolvedValue({});
});

describe('ResetPasswordForm', () => {
  it('saves the new password against the token in the link', async () => {
    const { user } = renderUi(<ResetPasswordForm />);

    await choose(user);

    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: password,
      token: 'abc123',
    });
    expect(
      await screen.findByText('Your password is changed'),
    ).toBeInTheDocument();
  });

  it.each([
    ['without a token', ''],
    ['that the server already refused', '?error=INVALID_TOKEN'],
  ])('offers a new link for a link %s', (_, search) => {
    atSearchParams(search);
    renderUi(<ResetPasswordForm />);

    expect(screen.getByText(resetLinkExpired)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ask for a new link' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('offers a new link when the token is spent by the time it is used', async () => {
    resetPassword.mockResolvedValue({ error: { code: 'INVALID_TOKEN' } });
    const { user } = renderUi(<ResetPasswordForm />);

    await choose(user);

    expect(await screen.findByText(resetLinkExpired)).toBeInTheDocument();
  });
});
