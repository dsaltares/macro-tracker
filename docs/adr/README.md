# Architecture Decision Records

Decisions that are expensive to reverse, or that a future reader would otherwise have to
reconstruct from the code. Everything else belongs in [`docs/DOMAIN.md`](../DOMAIN.md) (what the
words mean and how the data behaves) or the roadmap, pinned issue
[#67](https://github.com/dsaltares/macro-tracker/issues/67) (what we are building and in what
order).

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-one-container-sqlite-on-a-volume.md) | Run as one container, with SQLite on a volume | Accepted | 2026-10-19 |
| [0002](0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md) | Serve the app over tRPC and API keys over REST, both through shared services | Accepted | 2026-10-19 |
| [0003](0003-diary-entries-snapshot-their-nutrients.md) | Snapshot a diary entry's nutrient vector when it is logged | Accepted | 2026-10-19 |
| [0004](0004-one-canonical-nutrient-vector-per-100-g-in-wide-columns.md) | Store one canonical nutrient vector per 100 g, in wide columns, with sodium canonical | Accepted | 2026-10-19 |
| [0005](0005-import-reference-foods-in-the-server-open-food-facts-first.md) | Import reference foods inside the server, Open Food Facts first, through one adapter contract | Accepted | 2026-10-19 |
| [0006](0006-sessions-only-for-a-confirmed-address.md) | Authenticate with Better Auth over the app's SQLite, and open a session only for a confirmed address | Accepted | 2026-10-19 |
| [0007](0007-mail-through-resend-behind-a-send-email-seam.md) | Send mail through Resend behind a `sendEmail` seam, and keep it in an outbox for e2e | Accepted | 2026-10-19 |
| [0009](0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md) | Process the diary as health data on explicit consent, recorded at sign-up | Accepted | 2026-10-20 |

## How to add one

1. Copy [`template.md`](template.md) to `NNNN-kebab-case-title.md`, taking the next free number.
2. Write it before or alongside the change, not after — an ADR that documents a decision nobody
   can still argue with is a changelog entry.
3. Add a row to the index above.

## Conventions

- **One decision per record.** If the title needs an "and", it is probably two ADRs.
- **Status** is `Proposed`, `Accepted`, `Superseded by NNNN` or `Deprecated`. Records are
  append-only: supersede them, never rewrite history. Correcting a typo is fine; changing what was
  decided is a new ADR.
- **Revisit trigger** is mandatory. A decision with no stated trigger is a decision nobody will
  ever reopen, which is how accepted risks quietly become permanent ones.
- **`#N` is a GitHub issue number.** The roadmap is an issue too, so there is no second numbering.
- A decision Triumph already took is cited, not restated: link its ADR and write down only what is
  different here.
