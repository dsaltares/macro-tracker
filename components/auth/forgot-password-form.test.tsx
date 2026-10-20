import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { requestPasswordReset } from '@/test/auth-client';
import { renderUi } from '@/test/ui';

vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

beforeEach(() => {
  requestPasswordReset.mockResolvedValue({});
});

describe('ForgotPasswordForm', () => {
  it('asks for a link back to the reset page and says nothing about who has an account', async () => {
    const { user } = renderUi(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'eater@example.test');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'eater@example.test',
      redirectTo: '/reset-password',
    });
    expect(
      await screen.findByText(/If that address has an account/),
    ).toBeInTheDocument();
  });
});
