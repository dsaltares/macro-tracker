# 0009 — Process the diary as health data on explicit consent, recorded at sign-up

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #93, #22, [`docs/DOMAIN.md`](../DOMAIN.md) § Accounts

## Context

What someone eats and what they weigh, tied to their sex, birth date and height, is data
concerning health under GDPR Article 9. Processing it needs one of that article's exceptions on top
of an ordinary legal basis; performance of a contract, which covers Triumph's army lists, is not one
of them. The only exception that fits a personal food diary is explicit consent (Art. 9(2)(a)), and
consent has to be demonstrable: given by an affirmative act, before the processing, with a record of
when.

## Decision

Sign-up asks for consent and refuses an account without it. The sign-up form carries a required
checkbox agreeing to the terms and acknowledging the privacy policy; the server refuses
`/sign-up/email` with `TERMS_NOT_ACCEPTED` unless the body says `termsAccepted: true`, whatever the
form did, and stamps `users.terms_accepted_at` when it creates the user. The first Google sign-in,
which creates the account in the OAuth callback, asks for the same consent before redirecting to
Google (#22). Withdrawing consent is deleting the account. A change to the documents bumps their
`lastUpdated`; nobody is asked again.

## Alternatives considered

- **Legitimate interests or contract alone** — not an Article 9 exception, so not lawful for health
  data however small the app.
- **A consent banner or a settings toggle after sign-up** — data would be stored before consent, and
  a diary without it does nothing, so the toggle would only ever be a way to delete the account.
- **Re-consent on every change to the documents** — needs versioned documents and a gate in front of
  the app; disproportionate for a hobby service whose changes are announced by the revision date.

## Consequences

- Every way of creating a user must stamp `terms_accepted_at` or refuse; a new sign-up path (Google,
  an import) is incomplete until it does. A user with no stamp was created before this record.
- The privacy policy states this basis, and must change before the app processes anything new
  about a user's health.

## Revisit trigger

A material change to the privacy policy (a new recipient, such as the label-scanning AI provider in
#44, or a new kind of data), which may need fresh consent rather than a revised date; or a regulator
or user challenge to how consent is collected.
