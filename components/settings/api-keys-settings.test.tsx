import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ApiKeysSettings,
  loadFailed,
  revokeFailed,
} from '@/components/settings/api-keys-settings';
import { serveApi } from '@/test/api';
import { renderUi } from '@/test/ui';

const api = serveApi({ signedInAs: 'user-1' });

const render = () => renderUi(<ApiKeysSettings />, { wrap: api.wrap });

const storedKeys = () =>
  api
    .database()
    .selectFrom('api_keys')
    .select(['name', 'scopes', 'revoked_at'])
    .orderBy('created_at')
    .execute();

const openNewKey = async (user: ReturnType<typeof render>['user']) => {
  await user.click(await screen.findByRole('button', { name: 'New key' }));
  return screen.findByRole('dialog', { name: 'New key' });
};

const createKey = async (
  user: ReturnType<typeof render>['user'],
  name: string,
  form?: HTMLElement,
) => {
  const dialog = form ?? (await openNewKey(user));
  await user.type(within(dialog).getByLabelText('Name'), name);
  await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
  return screen.findByRole('dialog', { name: `Copy your key for ${name}` });
};

const keyList = () => screen.getByRole('region', { name: 'Your keys' });

describe('ApiKeysSettings', () => {
  it('says when there are no keys yet', async () => {
    render();

    expect(
      await screen.findByText(/^You have no keys yet\./),
    ).toBeInTheDocument();
  });

  it('creates a key with the scopes chosen and shows it once to copy', async () => {
    const { user } = render();
    await screen.findByText(/^You have no keys yet\./);

    const form = await openNewKey(user);
    await user.click(
      within(form).getByRole('checkbox', { name: /^Write: log food/ }),
    );
    const dialog = await createKey(user, 'Shortcuts', form);

    const key = (
      within(dialog).getByLabelText('Your new key') as HTMLInputElement
    ).value;
    expect(key).toMatch(/^mt_[0-9A-Za-z]{43}$/);
    await user.click(within(dialog).getByRole('button', { name: 'Copy key' }));
    expect(await navigator.clipboard.readText()).toBe(key);
    expect(
      within(dialog).getByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
    expect(await storedKeys()).toEqual([
      { name: 'Shortcuts', scopes: '["read","write"]', revoked_at: null },
    ]);

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/^mt_/)).not.toBeInTheDocument();
    const row = await within(keyList()).findByRole('listitem', {
      name: 'Shortcuts',
    });
    expect(within(row).getByText(`${key.slice(0, 8)}…`)).toBeInTheDocument();
    expect(
      within(row).getByText(/^Read and Write · Created/),
    ).toBeInTheDocument();
    expect(within(row).getByText('Never used')).toBeInTheDocument();
  });

  it('asks for a name and at least one scope', async () => {
    const { user } = render();
    await screen.findByText(/^You have no keys yet\./);

    const form = await openNewKey(user);
    await user.click(
      within(form).getByRole('checkbox', { name: /^Read: look up/ }),
    );
    await user.click(within(form).getByRole('button', { name: 'Create key' }));

    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one scope')).toBeInTheDocument();
    expect(await storedKeys()).toEqual([]);
  });

  it('shows when a key was last used', async () => {
    await api
      .database()
      .insertInto('api_keys')
      .values({
        id: 'key-1',
        user_id: 'user-1',
        name: 'Agent',
        prefix: 'mt_AbCdE',
        key_hash: 'hash',
        scopes: '["read"]',
        last_used_at: '2026-10-21T12:00:00.000Z',
        created_at: '2026-10-19T12:00:00.000Z',
      })
      .execute();
    render();

    const row = await within(keyList()).findByRole('listitem', {
      name: 'Agent',
    });
    expect(within(row).getByText('mt_AbCdE…')).toBeInTheDocument();
    expect(
      within(row).getByText('Read · Created Mon, 19 Oct 2026'),
    ).toBeInTheDocument();
    expect(
      within(row).getByText('Last used Wed, 21 Oct 2026'),
    ).toBeInTheDocument();
  });

  it('revokes a key once confirmed, and drops it from the list', async () => {
    const { user } = render();
    await screen.findByText(/^You have no keys yet\./);
    await user.click(
      within(await createKey(user, 'Shortcuts')).getByRole('button', {
        name: 'Done',
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Revoke Shortcuts' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke Shortcuts?')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke key' }),
    );

    expect(
      await screen.findByText(/^You have no keys yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await storedKeys())[0]?.revoked_at).not.toBeNull();
  });

  it('keeps the key when revoking is cancelled', async () => {
    const { user } = render();
    await screen.findByText(/^You have no keys yet\./);
    await user.click(
      within(await createKey(user, 'Shortcuts')).getByRole('button', {
        name: 'Done',
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Revoke Shortcuts' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(keyList()).getByRole('listitem', { name: 'Shortcuts' }),
    ).toBeInTheDocument();
    expect((await storedKeys())[0]?.revoked_at).toBeNull();
  });

  it('says so when a key cannot be revoked, and keeps it', async () => {
    const { user } = render();
    await screen.findByText(/^You have no keys yet\./);
    await user.click(
      within(await createKey(user, 'Shortcuts')).getByRole('button', {
        name: 'Done',
      }),
    );
    api.fails('apiKeys.revoke');

    await user.click(
      await screen.findByRole('button', { name: 'Revoke Shortcuts' }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Revoke key',
      }),
    );

    expect(await screen.findByText(revokeFailed)).toBeInTheDocument();
    expect((await storedKeys())[0]?.revoked_at).toBeNull();
  });

  it('says so when the keys cannot be loaded', async () => {
    api.fails('apiKeys.list');
    render();

    expect(await screen.findByText(loadFailed)).toBeInTheDocument();
  });
});
