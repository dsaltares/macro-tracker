# 0011 — Manage sign-in methods through the account router, keeping at least one in a single statement

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #89, [`docs/DOMAIN.md`](../DOMAIN.md) § Accounts, [ADR 0002](0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md), [ADR 0006](0006-sessions-only-for-a-confirmed-address.md), [ADR 0008](0008-link-google-to-the-account-on-the-same-confirmed-address.md)

## Context

#89 lets an account see its sign-in methods (password, Google), connect Google, set a password on
a Google-only account, and disconnect either, never the last. Better Auth 1.7 has an endpoint for
each, with catches:

- `unlinkAccount` sits behind `freshSessionMiddleware`: a session older than a day is refused with
  `SESSION_NOT_FRESH`. Sessions here last 400 days (ADR 0006), so nearly every account would be
  told to sign out and in again before disconnecting anything.
- `setPassword` is server only and needs the request's session headers. tRPC's context carries a
  caller, not headers, and the `ui` tests serve the router over MSW with a synthetic caller and no
  Better Auth session.
- `listUserAccounts` returns every column but the tokens and is keyed by row id, where the page
  only needs to know which of two methods exist.

Connecting Google is an OAuth redirect from the browser and cannot be anything but Better Auth's
`linkSocial`.

## Decision

Connecting Google goes through Better Auth's `linkSocial`, from the browser, back to
`/settings/account`, with `allowDifferentEmails` off as ADR 0008 set it: a Google account on
another address comes back as `?error=email_does_not_match` and the page says so.

Everything else is `account.signInMethods`, `account.setPassword` and `account.disconnect` on the
account router, over `lib/db/sign-in-methods.ts`, every statement carrying the caller's
`user_id`:

- Setting a password writes the row Better Auth's `setPassword` would (`provider_id
  'credential'`, `account_id` the user id, the hash from `better-auth/crypto`), in one
  `insert … select … where not exists`, so a second password is refused rather than added. It
  takes the sign-up password rules (`newPasswordSchema`). No mail round trip: the session already
  stands for a confirmed address.
- Disconnecting deletes that method's `accounts` row only `where exists` another method for the
  same user, so "never the last one" holds in the statement, not in a read before it. Nothing
  else is written.

## Alternatives considered

- **Better Auth's endpoints for all four.** A day-old session could not disconnect anything, and
  setting a password would need the context to carry headers and an `Auth` just for one
  procedure, with tests that build real sessions for every component state.
- **Lower `freshAge` to zero.** Turns off the freshness check for every sensitive Better Auth
  endpoint, present and future, to make one of them usable.
- **A confirmation mail before setting a password.** The reset link already does this for someone
  signed out; for someone signed in it proves nothing the session does not.

## Consequences

- Disconnecting Google does not stop it coming back: a later Google sign-in on the same confirmed
  address links again, implicitly, per ADR 0008. Disconnecting is "this is not how I sign in",
  not a block.
- A Better Auth upgrade that changes the shape of a credential row must be matched in
  `passwordCreation`; `auth.test.ts` signs in with a password set this way and fails first.
- `USES_GOOGLE` now points at Settings › Account to set a password, which closes ADR 0008's
  revisit trigger.

## Revisit trigger

A third sign-in method (another provider, passkeys): the two-method record and the "another
method exists" check become a list. Or a Better Auth release makes `setPassword` or
`unlinkAccount` reachable without a fresh session from a caller.
