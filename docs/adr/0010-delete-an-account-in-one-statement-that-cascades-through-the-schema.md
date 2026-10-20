# 0010 — Delete an account in one statement that cascades through the schema

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #24, [`docs/DOMAIN.md`](../DOMAIN.md) § Accounts, [ADR 0009](0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md)

## Context

Deleting an account is how someone exercises erasure and withdraws consent, so it has to reach
every row the user owns, at once, and keep reaching new ones as later milestones add tables
(recipes, weights, API keys). Better Auth's own `deleteUser` deletes sessions, accounts and
the user in separate calls and knows nothing of the app's tables. SQLite cannot add a foreign key
to an existing column: it takes a table rebuild, and `foods` holds every reference food, with
`foods_fts` keyed on its `rowid`.

## Decision

`account.delete` runs one `delete from users where id = ? and email = ?` for the caller, the
typed address as the confirmation on the same statement, and the schema does the rest. Every
table a user owns references `users.id` with `on delete cascade`: `sessions`, `accounts`,
`profiles`, `diary_entries`, `favourites`, and `food_source_preferences`, rebuilt with the key in
migration `0011`. A user's own foods (`foods.owner_user_id`) and their portions on any food
(`food_portions.user_id`) go through the `users_delete_owned_foods` trigger, because those columns
predate the users table and rebuilding `foods` is not worth it. A single statement is one transaction, triggers and cascades
included. The client then signs out, which only clears the cookie, since the session row is gone.

## Alternatives considered

- **Better Auth's `deleteUser`** — several statements, needs a fresh session or a mailed link,
  and still leaves the app's tables to us.
- **Deleting table by table in the service** — every new table must remember to add itself to a
  list, and forgetting fails silently.
- **Rebuilding `foods` and `food_portions` with foreign keys** — copies every reference food on
  migration for no behaviour the trigger lacks.

## Consequences

- A new table that holds a user's data references `users.id` with `on delete cascade`, or extends
  the trigger; `account.test.ts` gives every user one of everything and checks none survives.
- Copies already in backups age out as the privacy policy says; nothing else outlives the account.

## Revisit trigger

A user-owned table that cannot be keyed on `users.id`, or `foods` rebuilt for another reason, which
would let the trigger become a foreign key.
