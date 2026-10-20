# 0006 — Authenticate with Better Auth over the app's SQLite, and open a session only for a confirmed address

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #21, #22, #67, [ADR 0001](0001-one-container-sqlite-on-a-volume.md), [ADR 0002](0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md), Triumph [0015](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0015-require-a-confirmed-address-before-a-session.md)

## Context

Accounts hold diaries, weights and goals: personal data, unlike Triumph's army lists. The roadmap
(#67) settles on Better Auth with email and password, verification and reset mail, and Google
next (#22). Triumph took the same decision in its ADR
[0015](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0015-require-a-confirmed-address-before-a-session.md), after first
running without verification and finding that implicit account linking let anyone who registered
an address they did not own take over the real owner's later Google sign-in. That reasoning
applies here unchanged, and there is no anonymous mode to keep sign-up friction low for.

## Decision

Better Auth, over the Kysely instance in `lib/db/`, in the same SQLite file (ADR
[0001](0001-one-container-sqlite-on-a-volume.md)). Its four tables, `users`, `sessions`,
`accounts` and `verifications`, are an ordinary migration with snake_case columns like every other
table; `lib/auth/auth.ts` maps Better Auth's field names onto them.

`requireEmailVerification` is on: sign-up mails a confirmation link and opens no session, sign-in
on an unconfirmed address is refused, and following the link confirms the address and signs in.
Signing up with an address that already has an account answers exactly as a new one does. A reset
signs out every session. `resolveCaller` builds the tRPC caller only from a session whose user is
confirmed, and `accountProcedure` refuses a call without one.

`BETTER_AUTH_URL` is mandatory in production: without it Better Auth takes its origin, and every
link it mails, from the request's Host header. Better Auth's own per-IP rate limit is on in
production and off under e2e (`DISABLE_AUTH_RATE_LIMIT=1`), which signs up from one address in
parallel.

What differs from Triumph: no anonymous sessions, no per-address send budget yet (#67: no rate
limits yet, keep the seams), and English copy in the components rather than message keys.

## Alternatives considered

- **Verification off, as Triumph started.** Reopens the takeover Triumph closed, the moment Google
  (#22) links on email.
- **Auth.js or a hand-rolled session table.** Better Auth is what Triumph runs and what #67 chose;
  a second auth stack across the two apps doubles what has to be kept current.
- **Better Auth's camelCase columns, as Triumph has them.** Every other table here is snake_case
  and `user_id` is the ownership column on every statement (AGENTS.md); one table naming its user
  `userId` would be the odd one out forever.

## Consequences

- A user id exists only once an address is confirmed; nothing downstream needs an "unconfirmed"
  case.
- Google sign-in (#22) can enable implicit linking safely, because the local account's address is
  always confirmed.
- Every Better Auth field added later needs its column named in the `fields` maps in
  `lib/auth/auth.ts`, or Better Auth writes to a column that does not exist.

## Revisit trigger

Resend's daily cap is reached by confirmation or reset mail, or a sign-up from a bot shows up in
`users`: then add the per-address guards Triumph has in `lib/auth/rate-limit.ts`.
