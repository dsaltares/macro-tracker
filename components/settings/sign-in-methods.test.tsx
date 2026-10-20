import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  loadFailed,
  SignInMethods,
} from '@/components/settings/sign-in-methods';
import { lastSignInMethod } from '@/lib/trpc/routers/account';
import { serveApi } from '@/test/api';
import { linkSocial } from '@/test/auth-client';
import { renderUi } from '@/test/ui';

vi.mock('@/lib/auth/client', () => import('@/test/auth-client'));

const api = serveApi({ signedInAs: 'user-1' });

const email = 'user-1@example.test';

const connect = (provider: 'credential' | 'google') =>
  api
    .database()
    .insertInto('accounts')
    .values({
      id: `user-1-${provider}`,
      user_id: 'user-1',
      account_id: provider === 'google' ? 'google-subject-1' : 'user-1',
      provider_id: provider,
      password: provider === 'credential' ? 'hashed' : null,
    })
    .execute();

const providers = async () =>
  (
    await api
      .database()
      .selectFrom('accounts')
      .select('provider_id')
      .orderBy('provider_id')
      .execute()
  ).map(({ provider_id }) => provider_id);

const render = (props: { google?: boolean; linkError?: string } = {}) =>
  renderUi(<SignInMethods email={email} google {...props} />, {
    wrap: api.wrap,
  });

const method = async (name: string) =>
  within(await screen.findByRole('listitem', { name }));

const disconnectButton = (name: string) =>
  screen.getByRole('button', { name: `Disconnect ${name}` });

describe('SignInMethods', () => {
  it('shows both methods connected, either one free to disconnect', async () => {
    await connect('credential');
    await connect('google');
    render();

    expect((await method('Password')).getByText('Connected')).toBeVisible();
    const google = await method('Google');
    expect(google.getByText('Connected')).toBeVisible();
    expect(google.getByText(email)).toBeVisible();
    expect(disconnectButton('Password')).toBeEnabled();
    expect(disconnectButton('Google')).toBeEnabled();
    expect(
      screen.queryByRole('form', { name: 'Set a password' }),
    ).not.toBeInTheDocument();
  });

  it('shows a password account with Google to connect, and no way to drop the password', async () => {
    await connect('credential');
    render();

    expect((await method('Password')).getByText('Connected')).toBeVisible();
    expect((await method('Google')).getByText('Not connected')).toBeVisible();
    expect(disconnectButton('Password')).toBeDisabled();
    expect(screen.getByText('Your only way to sign in')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Connect Google' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('form', { name: 'Set a password' }),
    ).not.toBeInTheDocument();
  });

  it('shows a Google account with a password to set, and no way to drop Google', async () => {
    await connect('google');
    render();

    expect((await method('Password')).getByText('Not connected')).toBeVisible();
    expect((await method('Google')).getByText('Connected')).toBeVisible();
    expect(disconnectButton('Google')).toBeDisabled();
    expect(
      screen.getByRole('form', { name: 'Set a password' }),
    ).toBeInTheDocument();
  });

  it('offers no Google to connect when Google is not set up', async () => {
    await connect('credential');
    render({ google: false });

    expect((await method('Google')).getByText('Not connected')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Connect Google' }),
    ).not.toBeInTheDocument();
  });

  it('goes to Google to connect it, and comes back to this page', async () => {
    await connect('credential');
    const { user } = render();

    await user.click(
      await screen.findByRole('button', { name: 'Connect Google' }),
    );

    expect(linkSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/settings/account',
      errorCallbackURL: '/settings/account',
    });
  });

  it('says why Google came back unconnected', async () => {
    await connect('credential');
    render({ linkError: 'email_does_not_match' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That Google account has a different address from this one.',
    );
  });

  it('sets a password on a Google account, which can then drop Google', async () => {
    await connect('google');
    const { user } = render();

    await screen.findByRole('form', { name: 'Set a password' });
    await user.type(
      screen.getByLabelText('Password', { selector: 'input' }),
      'lentils-and-rice-forever',
    );
    await user.type(
      screen.getByLabelText('Repeat password'),
      'lentils-and-rice-forever',
    );
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(
      await (await method('Password')).findByText('Connected'),
    ).toBeVisible();
    expect(
      screen.queryByRole('form', { name: 'Set a password' }),
    ).not.toBeInTheDocument();
    expect(disconnectButton('Google')).toBeEnabled();
    expect(await providers()).toEqual(['credential', 'google']);
  });

  it('holds a new password to the sign-up rules', async () => {
    await connect('google');
    const { user } = render();

    await screen.findByRole('form', { name: 'Set a password' });
    await user.type(
      screen.getByLabelText('Password', { selector: 'input' }),
      'short',
    );
    await user.type(screen.getByLabelText('Repeat password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set password' }));

    expect(
      await screen.findByText('Use at least 12 characters.'),
    ).toBeVisible();
    expect(await providers()).toEqual(['google']);
  });

  it('disconnects Google, leaving the password as the only way in', async () => {
    await connect('credential');
    await connect('google');
    const { user } = render();

    await method('Google');
    await user.click(disconnectButton('Google'));

    expect(
      await (await method('Google')).findByText('Not connected'),
    ).toBeVisible();
    expect(disconnectButton('Password')).toBeDisabled();
    expect(await providers()).toEqual(['credential']);
  });

  it('says so when a disconnect is refused, and keeps the method', async () => {
    await connect('credential');
    await connect('google');
    const { user } = render();
    await method('Google');
    await api
      .database()
      .deleteFrom('accounts')
      .where('provider_id', '=', 'credential')
      .execute();

    await user.click(disconnectButton('Google'));

    expect(await screen.findByText(lastSignInMethod)).toBeVisible();
    expect(await providers()).toEqual(['google']);
  });

  it('says so when the methods cannot be loaded', async () => {
    api.fails('account.signInMethods');
    render();

    expect(await screen.findByText(loadFailed)).toBeVisible();
  });
});
