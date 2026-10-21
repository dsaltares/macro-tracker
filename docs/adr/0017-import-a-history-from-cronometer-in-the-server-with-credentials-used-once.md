# 0017 — Import a history from Cronometer in the server, with credentials used once

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** [`docs/DOMAIN.md`](../DOMAIN.md) § Diary, ADR [0002](0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md), ADR [0003](0003-diary-entries-snapshot-their-nutrients.md), ADR [0005](0005-import-reference-foods-in-the-server-open-food-facts-first.md)

## Context

Moving here means bringing a Cronometer history: over two months, about 1,200 entries over 350
foods and a weight most mornings, and possibly years more. Cronometer has no public API. Its
website's export is per entry, without the foods behind them, and rate-limited. Its Android app
talks to a JSON API (`mobile.cronometer.com/api/v2`) that fitness-tracker already reads: a login
with the account's email and password, the diary one day per call, foods by id in a batch with
their nutrients per 100 g by USDA nutrient number, and biometrics such as weight over a range. A
run makes hundreds of calls and food searches, too long to hold a request open, and the user
wants to follow it and be told when it ends.

## Decision

Settings › Import takes the source and the user's Cronometer email and password and calls
`historyImport.start`, which signs in to check them, records a `history_imports` row (one
`running` per user, by a partial unique index) and runs the import in the server after
answering, writing through the same services as the app. Cronometer says nowhere when an account's
history starts, so it reads every day from today back to Cronometer's launch (2011), seven at a
time, skipping the dates already logged here: about 5,800 calls for a full history, a few
minutes, with the days read as its progress. The row keeps the phase and progress,
which the page polls, and the summary; the user is mailed when it ends. The credentials live in
that run's memory only. The client names itself as the Android app, as the API requires, and
signs in with no time zone, which would otherwise overwrite the account's. A restart fails a
running import, as it does a food import; running it again skips every date already logged,
which is also how it stays idempotent. Entries are food entries resolved from the matched or
created food, so they snapshot what that food gives (ADR 0003); one whose food does not agree
with Cronometer's amounts per 100 g is a quick entry of its totals instead. It is tRPC only:
like the label scan and the export, it is not offered to API keys.

## Alternatives considered

- **Through fitness-tracker's cache** — only for whoever runs one, and only as far back as it
  has synced; it was the first version of this.
- **Cronometer's CSV export** — per entry without the foods, so no food could be matched or
  created, and the export is rate-limited.
- **A CLI over `/api/v1`** — needs an API key here as well, runs off the server, and cannot
  report to the page.
- **Storing the credentials for later runs** — a password for another service at rest, for a run
  that is repeated rarely.

## Consequences

The import depends on an undocumented API that Cronometer can change or refuse at any time; when
it does, a run fails with a message and nothing half-imported is lost. A Cronometer account that
signs in with Google has no password and cannot be imported. A run shares the server's event
loop between yields, and every run asks for every day not yet logged here, which is a lot of
calls to an API that may start limiting them. Another source is a client beside
`lib/imports/cronometer/` and an entry in `historySources`.

## Revisit trigger

Cronometer changes, rate-limits or blocks the mobile API, publishes an official one or a way to
find where a history starts, or a user needs to import
an account that signs in with Google; or a run slows the app for others.
