import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { minPasswordLength, termsRequired } from '@/lib/auth/credentials';
import { signIn, signUp } from '@/test/auth-client';
import { atSearchParams, router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const password = 'lentils-and-rice-forever';

const fill = async (
  user: ReturnType<typeof renderUi>['user'],
  {
    chosen = password,
    repeated = chosen,
    agrees = true,
  }: { chosen?: string; repeated?: string; agrees?: boolean } = {},
) => {
  await user.type(screen.getByLabelText('Email'), 'eater@example.test');
  await user.type(screen.getByLabelText('Password'), chosen);
  await user.type(screen.getByLabelText('Repeat password'), repeated);
  if (agrees) {
    await user.click(consent());
  }
  await user.click(screen.getByRole('button', { name: 'Create account' }));
};

const consent = () =>
  screen.getByRole('checkbox', { name: /I agree to the terms/ });

beforeEach(() => {
  atSearchParams('');
  signUp.email.mockResolvedValue({});
  signIn.social.mockClear();
});

describe('SignUpForm', () => {
  it('asks for a long enough password', async () => {
    const { user } = renderUi(<SignUpForm google={false} />);

    await fill(user, { chosen: 'short' });

    expect(
      await screen.findByText(`Use at least ${minPasswordLength} characters.`),
    ).toBeInTheDocument();
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it('asks for the same password twice', async () => {
    const { user } = renderUi(<SignUpForm google={false} />);

    await fill(user, { repeated: `${password}!` });

    expect(
      await screen.findByText('Those two passwords do not match.'),
    ).toBeInTheDocument();
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it('requires agreeing to the terms before creating the account', async () => {
    const { user } = renderUi(<SignUpForm google={false} />);

    await fill(user, { agrees: false });

    expect(await screen.findByText(termsRequired)).toBeInTheDocument();
    expect(consent()).toHaveAttribute('aria-invalid', 'true');
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it('links the terms and the privacy policy from the agreement, in a new tab', () => {
    renderUi(<SignUpForm google={false} />);

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('creates the account with a confirmation link back to where it was headed', async () => {
    atSearchParams('?next=%2Fdiary');
    const { user } = renderUi(<SignUpForm google={false} />);

    await fill(user);

    expect(signUp.email).toHaveBeenCalledWith({
      email: 'eater@example.test',
      password,
      name: 'eater',
      termsAccepted: true,
      callbackURL: '/verify?next=%2Fdiary',
    });
    expect(router.push).toHaveBeenCalledWith(
      '/verify?email=eater%40example.test&next=%2Fdiary',
    );
  });

  it('asks for the agreement before it goes to Google', async () => {
    const { user } = renderUi(<SignUpForm google />);

    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(termsRequired);
    expect(consent()).toHaveAttribute('aria-invalid', 'true');
    expect(signIn.social).not.toHaveBeenCalled();
  });

  it('creates the account with Google once the terms are agreed', async () => {
    const { user } = renderUi(<SignUpForm google />);

    await user.click(consent());
    await user.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    );

    expect(signIn.social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/',
      errorCallbackURL: '/sign-in',
      additionalData: { termsAccepted: true },
    });
    expect(signUp.email).not.toHaveBeenCalled();
  });
});
