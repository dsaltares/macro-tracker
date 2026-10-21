'use client';

import { IconCheck, IconCopy, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { submitButtonClass } from '@/components/auth/auth-form';
import { CheckboxField, FormError, TextField } from '@/components/auth/fields';
import { SettingsPage } from '@/components/settings/settings-page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ApiKey, CreatedApiKey } from '@/lib/db/api-keys';
import {
  type ApiKeyScope,
  apiKeyScopes,
  newApiKeySchema,
} from '@/lib/domain/api-keys';
import { formatDay, localDateOf } from '@/lib/domain/dates';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

export const loadFailed = 'Your API keys could not be loaded.';

export const revokeFailed = 'The key could not be revoked. Try again.';

export const copyFailed = 'The key could not be copied. Select it and copy it.';

const scopeLabels: Record<ApiKeyScope, string> = {
  read: 'Read: look up foods, your diary and your goals',
  write: 'Write: log food and change your diary',
};

const scopeNames: Record<ApiKeyScope, string> = {
  read: 'Read',
  write: 'Write',
};

const dayOf = (instant: string) => formatDay(localDateOf(new Date(instant)));

type FieldErrors = { name?: string | undefined; scopes?: string | undefined };

function useRefreshKeys() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: trpc.apiKeys.list.queryKey() });
}

function NewKeyForm({
  onCreated,
}: {
  onCreated: (key: CreatedApiKey) => void;
}) {
  const trpc = useTRPC();
  const refreshKeys = useRefreshKeys();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<readonly ApiKeyScope[]>(['read']);
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useMutation(
    trpc.apiKeys.create.mutationOptions({
      onSuccess: async (created) => {
        onCreated(created);
        await refreshKeys();
      },
    }),
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = newApiKeySchema.safeParse({ name, scopes });
    if (!parsed.success) {
      const { fieldErrors } = parsed.error.flatten();
      setErrors({
        name: fieldErrors.name?.[0],
        scopes: fieldErrors.scopes?.[0],
      });
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  const toggle = (scope: ApiKeyScope, checked: boolean) =>
    setScopes(
      apiKeyScopes.filter((candidate) =>
        candidate === scope ? checked : scopes.includes(candidate),
      ),
    );

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      {create.isError ? <FormError>{failureOf(create.error)}</FormError> : null}
      <TextField
        label="Name"
        autoComplete="off"
        hint="Where you will use it, like “Shortcuts on my phone”"
        error={errors.name}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-medium text-sm">What it may do</legend>
        {apiKeyScopes.map((scope) => (
          <CheckboxField
            key={scope}
            label={scopeLabels[scope]}
            checked={scopes.includes(scope)}
            onCheckedChange={(checked) => toggle(scope, checked)}
          />
        ))}
        {errors.scopes ? (
          <p className="text-destructive text-xs">{errors.scopes}</p>
        ) : null}
      </fieldset>
      <Button
        type="submit"
        size="lg"
        disabled={create.isPending}
        className={submitButtonClass}
      >
        {create.isPending ? 'Creating…' : 'Create key'}
      </Button>
    </form>
  );
}

function CreateKeyDialog({
  onCreated,
  onClose,
}: {
  onCreated: (key: CreatedApiKey) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">New key</DialogTitle>
          <DialogDescription>
            A key lets a script, a shortcut or an agent use your account through
            the API. Give each one its own, so you can revoke it alone.
          </DialogDescription>
        </DialogHeader>
        <NewKeyForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function NewKeyDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const keyId = useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setFailed(false);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            Copy your key for {created.name}
          </DialogTitle>
          <DialogDescription>
            This is the only time it is shown. Keep it somewhere safe: anyone
            with it can use your account through the API.
          </DialogDescription>
        </DialogHeader>
        {failed ? <FormError>{copyFailed}</FormError> : null}
        <label htmlFor={keyId} className="sr-only">
          Your new key
        </label>
        <input
          id={keyId}
          readOnly
          value={created.key}
          onFocus={(event) => event.target.select()}
          className="w-full rounded-md border bg-muted px-3 py-2 font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" size="lg" className="h-11" onClick={copy}>
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? 'Copied' : 'Copy key'}
          </Button>
          <Button size="lg" className="h-11" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKey;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const refreshKeys = useRefreshKeys();
  const revoke = useMutation(
    trpc.apiKeys.revoke.mutationOptions({
      onSuccess: async () => {
        await refreshKeys();
        onClose();
      },
    }),
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Revoke {apiKey.name}?</DialogTitle>
          <DialogDescription>
            Anything using it stops working at once. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {revoke.isError ? <FormError>{revokeFailed}</FormError> : null}
        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="h-11"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(apiKey.id)}
          >
            {revoke.isPending ? 'Revoking…' : 'Revoke key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
}) {
  const nameId = useId();

  return (
    <li aria-labelledby={nameId} className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={nameId} className="truncate font-medium">
          {apiKey.name}
        </span>
        <span className="font-mono text-muted-foreground text-xs">
          {apiKey.prefix}…
        </span>
        <span className="text-muted-foreground text-xs">
          {apiKey.scopes.map((scope) => scopeNames[scope]).join(' and ')} ·
          Created {dayOf(apiKey.createdAt)}
        </span>
        <span className="text-muted-foreground text-xs">
          {apiKey.lastUsedAt === null
            ? 'Never used'
            : `Last used ${dayOf(apiKey.lastUsedAt)}`}
        </span>
      </div>
      <Button variant="outline" onClick={onRevoke}>
        Revoke
        <span className="sr-only"> {apiKey.name}</span>
      </Button>
    </li>
  );
}

function KeyList({ onRevoke }: { onRevoke: (apiKey: ApiKey) => void }) {
  const trpc = useTRPC();
  const keys = useQuery(trpc.apiKeys.list.queryOptions());

  const content = () => {
    if (keys.isPending) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    if (keys.isError) {
      return <FormError>{loadFailed}</FormError>;
    }
    if (keys.data.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          You have no keys yet. A key lets a script, a shortcut or an agent use
          your account through the API.
        </p>
      );
    }
    return (
      <ul className="flex flex-col divide-y rounded-lg border">
        {keys.data.map((apiKey) => (
          <KeyRow
            key={apiKey.id}
            apiKey={apiKey}
            onRevoke={() => onRevoke(apiKey)}
          />
        ))}
      </ul>
    );
  };

  return (
    <section aria-labelledby="api-keys" className="flex flex-col gap-4">
      <h2 id="api-keys" className="sr-only">
        Your keys
      </h2>
      {content()}
    </section>
  );
}

export function ApiKeysSettings() {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  return (
    <SettingsPage
      title="API keys"
      end={
        <Button size="lg" className="h-11" onClick={() => setCreating(true)}>
          <IconPlus className="size-5" />
          New key
        </Button>
      }
    >
      <KeyList onRevoke={setRevoking} />
      {creating ? (
        <CreateKeyDialog
          onCreated={(key) => {
            setCreating(false);
            setCreated(key);
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {created ? (
        <NewKeyDialog created={created} onClose={() => setCreated(null)} />
      ) : null}
      {revoking ? (
        <RevokeDialog apiKey={revoking} onClose={() => setRevoking(null)} />
      ) : null}
    </SettingsPage>
  );
}
