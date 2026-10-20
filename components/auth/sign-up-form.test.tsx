import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { minPasswordLength } from '@/lib/auth/credentials';
import { signUp } from '@/test/auth-client';
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
  }: { chosen?: string; repeated?: string } = {},
) => {
  await user.type(screen.getByLabelText('Email'), 'eater@example.test');
  await user.type(screen.getByLabelText('Password'), chosen);
  await user.type(screen.getByLabelText('Repeat password'), repeated);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
};

beforeEach(() => {
  atSearchParams('');
  signUp.email.mockResolvedValue({});
});

describe('SignUpForm', () => {
  it('asks for a long enough password', async () => {
    const { user } = renderUi(<SignUpForm />);

    await fill(user, { chosen: 'short' });

    expect(
      await screen.findByText(`Use at least ${minPasswordLength} characters.`),
    ).toBeInTheDocument();
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it('asks for the same password twice', async () => {
    const { user } = renderUi(<SignUpForm />);

    await fill(user, { repeated: `${password}!` });

    expect(
      await screen.findByText('Those two passwords do not match.'),
    ).toBeInTheDocument();
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it('creates the account with a confirmation link back to where it was headed', async () => {
    atSearchParams('?next=%2Fdiary');
    const { user } = renderUi(<SignUpForm />);

    await fill(user);

    expect(signUp.email).toHaveBeenCalledWith({
      email: 'eater@example.test',
      password,
      name: 'eater',
      callbackURL: '/verify?next=%2Fdiary',
    });
    expect(router.push).toHaveBeenCalledWith(
      '/verify?email=eater%40example.test&next=%2Fdiary',
    );
  });
});
