# 0017 — Import a history in the server, over the user's own services, with a key used once

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [`docs/DOMAIN.md`](../DOMAIN.md) § Diary, ADR [0002](0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md), ADR [0003](0003-diary-entries-snapshot-their-nutrients.md), ADR [0005](0005-import-reference-foods-in-the-server-open-food-facts-first.md)

## Context

Moving here means bringing months of Cronometer history: about 1,200 entries over 350 foods and a
weight most mornings. fitness-tracker already caches that diary, with each food's nutrients per
100 g by Cronometer nutrient id (the USDA nutrient numbers) and the scale's weigh-ins, behind a
read-only SQL endpoint and an API key. Cronometer has no public API and its export is per entry,
without the foods behind them. A run makes hundreds of food searches and a few hundred writes, too
long to hold a request open, and the user wants to follow it and be told when it ends.

## Decision

Settings › Import takes a source and its key and calls `historyImport.start`, which checks the key
against the source, records a `history_imports` row (one `running` per user, by a partial unique
index) and runs the import in the server after answering, writing through the same services as the
app. The row keeps the phase and progress, which the page polls, and the summary; the user is
mailed when it ends. The key lives in that run's memory only. The source's address is server
configuration (`FITNESS_TRACKER_URL`), never user input, so the server cannot be pointed at an
arbitrary host. A restart fails a running import, as it does a food import; running it again skips
every date already logged, which is also how it stays idempotent. Entries are food entries resolved
from the matched or created food, so they snapshot what that food gives (ADR 0003); one whose food
does not agree with the source's amounts per 100 g is a quick entry of the source's totals instead.
It is tRPC only: like the label scan and the export, it is not offered to API keys.

## Alternatives considered

- **A CLI over `/api/v1`** — needs a key for this app as well as the source's, runs off the server,
  and cannot report to the page.
- **A worker thread, as the food import** — the work is mostly waiting on the source; its writes
  are small transactions, and the run yields between steps.
- **Storing the key for later runs** — a credential for another service at rest, for a run that is
  repeated rarely.
- **Reading Cronometer directly** — its mobile API is undocumented and wants the user's password;
  fitness-tracker already does that.

## Consequences

A run shares the server's event loop: a search over the reference foods blocks it for its
milliseconds, between yields. A new source is an adapter beside `lib/imports/fitness-tracker/` and
an entry in `historySources`. Users without a fitness-tracker have no source yet.

## Revisit trigger

A second source that is not one of the user's own services, a run that takes long enough to slow
the app for others, or a request to schedule imports, which would need the key at rest.
