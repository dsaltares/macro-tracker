# 0011 — Derive goals live from the profile and the latest weight

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #39, #40, #42, #43, #67, [`docs/DOMAIN.md`](../DOMAIN.md) § Body and goals

## Context

A derived goal is arithmetic over things that change on their own schedule:

- **Weight** changes whenever the user logs a body measurement (#37), daily for some users.
- **Age** changes on a birthday, and BMR takes it.
- **The profile** (height, activity level) and **the goal settings** (weekly rate, protein g/kg,
  fat share) change when the user edits them in settings.

The day view (#43) and the nutrient report compare a date's totals to that date's goal vector. The
arithmetic is a handful of multiplications in `lib/domain/goals/`, cheap to run on every read.

## Decision

The goal vector for a date is **computed when it is read**, from the profile, the **latest weight
on or before that date**, the age on that date, and the goal settings, and is **never stored**.
`derivedGoal(profile, weightKg, date, settings)` is the one function that does it, and returns its
warnings with it. The goal settings are one row per user (#40) and keep no history in v1, so a
change to them or to the profile also changes the goal shown for past dates; a new weight changes
the goal from its date on.

## Alternatives considered

- **Store the computed targets when the settings are saved.** Fast to read, and stale the moment a
  weight is logged or a birthday passes: every new weight would have to rewrite them.
- **Store a goal vector per day.** Past days would keep the goal they had, at the cost of a row per
  user per day, written by something that has to run every day or on every weight and settings
  change.
- **Version the goal settings and the profile.** Exact history of what the user had set then. More
  schema and more reads than v1 needs while nobody has asked to see last month against last month's
  goal.

## Consequences

- A weight logged today moves today's targets and every later day's, with nothing to recompute.
- Goals for past dates are only as historical as their weight: editing the rate or the activity
  level rewrites how earlier days compare. Totals stay snapshots (ADR
  [0003](0003-diary-entries-snapshot-their-nutrients.md)); only the targets move.
- Every read of a date's goal needs that date's latest weight, which is one indexed read on the
  weight log per date and, for a range, one read of the log over it.
- With no weight logged yet there is no derived goal, so the reader has to ask for one.

## Revisit trigger

Users asking for past days to keep the goal they had at the time, or a trends range spending its
time deriving goals rather than summing entries.
