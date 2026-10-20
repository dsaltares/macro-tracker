# 0008 — Link a Google sign-in to the account on the same address, and drop a password nobody confirmed

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #22, #89, [ADR 0006](0006-sessions-only-for-a-confirmed-address.md), [ADR 0009](0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md), Triumph [0004](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0004-implicit-account-linking.md), Triumph [0015](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0015-require-a-confirmed-address-before-a-session.md)

## Context

Someone who signed up with a password and later taps Google on the same address expects the same
diary, not a second, empty one. Better Auth links implicitly on a matching address. Triumph's ADR
[0004](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0004-implicit-account-linking.md)
names the hole that opens: anyone can register an address they do not own, and when the owner
later signs in with Google, linking hands the owner's sign-in to an account the squatter holds a
password for. ADR [0006](0006-sessions-only-for-a-confirmed-address.md) closes it for confirmed
accounts, but an account that never followed its confirmation link still has a `users` row and a
password, and #22 wants Google to confirm it rather than refuse.

Better Auth's `trustedProviders` decides whether to link when the *provider* has not confirmed the
address; it says nothing about the local side.

## Decision

`accountLinking` is on, with `trustedProviders` empty, `allowDifferentEmails` off and
`requireLocalEmailVerified` off. Google links only when it reports `email_verified`; a Google
address it has not confirmed is refused (`account_not_linked`).

Linking onto a confirmed account keeps the password: the account then has two `accounts` rows and
either signs in. Linking onto an account whose address was never confirmed confirms it, and an
`account.create.after` database hook in `lib/auth/auth.ts` deletes that user's `credential` row in
the same request. The password was chosen by whoever typed the address, which Google has just shown
need not be its owner; the owner keeps Google and can set a password by reset mail or, later, from
settings (#89).

A Google sign-in that would create a user needs the consent ADR
[0009](0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md) requires: the button on
Create account checks the same box first and sends `termsAccepted` through the OAuth state, and a
`user.create.before` hook stamps `terms_accepted_at` or refuses with `TERMS_NOT_ACCEPTED`. The
button on Sign in sends nothing, so it signs in and links but never creates a user; a new address
there comes back with a message pointing to Create account.

A password sign-in on an account with Google and no password answers `USES_GOOGLE`, and the sign-in
form says to use the Google button, instead of a wrong-password error.

## Alternatives considered

- **Google as a trusted provider, as #22 first wrote it.** Trust only matters when Google has *not*
  confirmed the address, which is exactly the case to refuse.
- **Refuse to link onto an unconfirmed account, as Triumph does.** Safe, but someone who signed up,
  missed the mail and tapped Google is stuck with an error on their own address.
- **Link and keep the unconfirmed password.** The takeover Triumph 0004 describes, by another route.

## Consequences

- An unconfirmed sign-up who later uses Google loses the password they chose; a reset mail sets a
  new one.
- `USES_GOOGLE` tells anyone who asks that an address has a Google-only account. Sign-up still
  answers a taken address as a new one; this leak is accepted because the alternative is a
  wrong-password error the owner cannot act on.
- The callback's errors come back to `/sign-in?error=<code>`, which the form turns into copy.

## Revisit trigger

A second social provider is added (its address claims must be checked the same way), or #89 ships
setting a password from settings, at which point `USES_GOOGLE` should point there too.
