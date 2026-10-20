# 0007 — Send mail through Resend behind a `sendEmail` seam, and keep it in an outbox for e2e

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #21, #67, [ADR 0006](0006-sessions-only-for-a-confirmed-address.md), Triumph [0014](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0014-resend-behind-a-send-email-seam.md)

## Context

The app mails two things: the confirmation link and the password reset link (ADR
[0006](0006-sessions-only-for-a-confirmed-address.md)). It runs as one container on a residential
connection, so it cannot deliver mail itself. Triumph's ADR
[0014](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0014-resend-behind-a-send-email-seam.md) chose Resend behind a seam for
the same reasons, and that applies here as written.

The e2e journey for #21 has to follow the link that was mailed, which Triumph's e2e never did: it
confirms addresses by writing to the database.

## Decision

As Triumph: `SendEmail` in `lib/email/transport.ts` takes a rendered `EmailMessage` and resolves
to a delivered id or a failure, never throwing. Templates are React Email components rendered to
HTML and plain text before a transport sees them. With no `RESEND_API_KEY` or no `EMAIL_FROM`, the
transport logs the message through pino, link included. A reserved test address (`.test`,
`example.com`, …) is logged, never handed to Resend.

Different here: with `EMAIL_OUTBOX_DIR` set, every message is also written there as one JSON file
before the transport sends it. The e2e server sets it, and `e2e/auth.ts` reads the newest message
to an address and follows its link.

## Alternatives considered

- **Confirm addresses in the database, as Triumph's e2e does.** Never exercises the link, its
  callback or the redirect after it, which is where the bugs are.
- **Read the link from the server log.** Playwright's `webServer` output is not available to a
  test, and parsing pretty-printed pino is brittle.
- **A local SMTP catcher (Mailpit).** A second process in e2e and CI to replace one directory.

## Consequences

- No mail leaves a development machine or CI, whatever key is configured, for any test address.
- The outbox is a test seam only; production never sets `EMAIL_OUTBOX_DIR`.

## Revisit trigger

A third kind of mail that needs its own delivery guarantees (receipts, digests), or Resend's free
tier stops covering the volume.
