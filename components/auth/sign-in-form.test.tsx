import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from '@/components/auth/sign-in-form';
import { signIn } from '@/test/auth-client';
import { atSearchParams, router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');
const submit = () => screen.getByRole('button', { name: /^Sign(ing)? in/ });

const signInWith = async (user: ReturnType<typeof renderUi>['user']) => {
  await user.type(email(), 'Eater@Example.test');
  await user.type(password(), 'lentils-and-rice-forever');
  await user.click(submit());
};

beforeEach(() => {
  atSearchParams('');
  signIn.email.mockResolvedValue({});
});

describe('SignInForm', () => {
  it('checks the address before it asks the server anything', async () => {
    const { user } = renderUi(<SignInForm />);

    await user.type(email(), 'eater');
    await user.click(submit());

    expect(
      await screen.findByText('That does not look like an email address.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(signIn.email).not.toHaveBeenCalled();
  });

  it('signs in with the address lowercased and goes where it was headed', async () => {
    atSearchParams('?next=%2Fdiary');
    const { user } = renderUi(<SignInForm />);

    await signInWith(user);

    expect(signIn.email).toHaveBeenCalledWith({
      email: 'eater@example.test',
      password: 'lentils-and-rice-forever',
    });
    expect(router.replace).toHaveBeenCalledWith('/diary');
  });

  it('sends an unconfirmed address to confirm it', async () => {
    signIn.email.mockResolvedValue({ error: { code: 'EMAIL_NOT_VERIFIED' } });
    const { user } = renderUi(<SignInForm />);

    await signInWith(user);

    expect(router.push).toHaveBeenCalledWith(
      '/verify?email=eater%40example.test',
    );
  });

  it('says so when the password does not match', async () => {
    signIn.email.mockResolvedValue({
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 },
    });
    const { user } = renderUi(<SignInForm />);

    await signInWith(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match an account.',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
