import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyAddress } from '@/components/auth/verify-address';
import { confirmationLinkExpired } from '@/lib/auth/errors';
import { sendVerificationEmail } from '@/test/auth-client';
import { renderUi } from '@/test/ui';

vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

beforeEach(() => {
  sendVerificationEmail.mockResolvedValue({});
});

describe('VerifyAddress', () => {
  it('says where the link went and sends it again on request', async () => {
    const { user } = renderUi(
      <VerifyAddress
        email="eater@example.test"
        error={undefined}
        next="/diary"
      />,
    );

    expect(screen.getByText('eater@example.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send it again' }));

    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'eater@example.test',
      callbackURL: '/verify?next=%2Fdiary',
    });
    expect(await screen.findByText(/On its way/)).toBeInTheDocument();
  });

  it('asks for the address to send a new link to when the old one is spent', async () => {
    const { user } = renderUi(
      <VerifyAddress
        email={undefined}
        error={confirmationLinkExpired}
        next={null}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      confirmationLinkExpired,
    );
    await user.type(screen.getByLabelText('Email'), 'eater@example.test');
    await user.click(
      screen.getByRole('button', { name: 'Send me a new link' }),
    );

    expect(
      await screen.findByText('Confirm your address to finish'),
    ).toBeInTheDocument();
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'eater@example.test',
      callbackURL: '/verify',
    });
  });
});
