import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteAccount } from '@/components/settings/delete-account';
import { somethingWentWrong } from '@/lib/auth/errors';
import { serveApi } from '@/test/api';
import { signOut } from '@/test/auth-client';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const api = serveApi({ signedInAs: 'user-1' });

const email = 'user-1@example.test';

const render = () =>
  renderUi(<DeleteAccount email={email} />, { wrap: api.wrap });

const confirmation = () =>
  screen.getByLabelText('Type your email address to confirm');

const deleteButton = () =>
  screen.getByRole('button', { name: 'Delete account' });

const users = () => api.database().selectFrom('users').select('id').execute();

describe('DeleteAccount', () => {
  it('stays shut until the address on the account is typed', async () => {
    const { user } = render();

    expect(deleteButton()).toBeDisabled();
    await user.type(confirmation(), 'user-2@example.test');
    expect(deleteButton()).toBeDisabled();

    await user.clear(confirmation());
    await user.type(confirmation(), ' User-1@Example.test');
    expect(deleteButton()).toBeEnabled();
  });

  it('deletes the account, signs out and goes to sign in', async () => {
    const { user } = render();

    await user.type(confirmation(), email);
    await user.click(deleteButton());

    await vi.waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/sign-in'),
    );
    expect(signOut).toHaveBeenCalled();
    expect(await users()).toEqual([]);
  });

  it('says so when the account cannot be deleted, and keeps it', async () => {
    api.fails('account.delete');
    const { user } = render();

    await user.type(confirmation(), email);
    await user.click(deleteButton());

    expect(await screen.findByText(somethingWentWrong)).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(await users()).toEqual([{ id: 'user-1' }]);
  });
});
