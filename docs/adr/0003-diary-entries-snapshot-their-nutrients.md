# 0003 — Snapshot a diary entry's nutrient vector when it is logged

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #13, #25, #26, #27, #52, #53, #67, [`docs/DOMAIN.md`](../DOMAIN.md) § Diary

## Context

A diary entry says what someone ate. What it ate is a **food** or a **recipe**, and neither of them
holds still.

- **Reference foods are rewritten every month.** The importer (#13) upserts every Open Food Facts
  product and every generic table row by `(source, source_id)`. Open Food Facts is crowd-edited:
  a product's label is corrected, reformulated or vandalised between two runs. A product that
  disappears upstream is archived, and stays archived.
- **Users edit their own foods**, and delete them.
- **A recipe's nutrients are computed** from its ingredients' current values, so editing any
  ingredient food, or the recipe, changes every serving of it.

If an entry read its nutrients through those rows at display time, last March would change every
month, a weight trend would be explained by numbers that are no longer the ones the user saw, and
an export would not reproduce. People log against what the label said on the day.

Entries are few — a handful per user per day — and totals are only ever read for one user's dates.

## Decision

Every diary entry stores the **nutrient vector it resolved to, for its grams**, at the moment it is
logged, together with the label it shows. Totals are sums over those snapshots, computed when read
and never stored.

- **Storage.** `diary_entries.nutrients` is a JSON object from nutrient key to amount (#25). It is
  partial: a nutrient the food did not declare is absent, which means unknown, never zero.
- **Resolution** is `resolveEntry(food, portion, quantity)` in `lib/domain/diary/` (#26). A food
  entry resolves the food's per-100 g vector against the grams; a recipe entry resolves the
  recipe's computed vector (#52); a quick entry's vector is what was typed.
- **Editing an entry.** Changing its quantity or portion re-resolves the snapshot from the food's
  current values — the user is logging again, so they see today's numbers. Moving it to another
  meal, date or time keeps the snapshot (#27).
- **Links stay, but are not read for totals.** `food_id` and `recipe_id` say where an entry came
  from, for re-logging and favourites. A food that is archived still resolves from the diary; a
  food that is deleted leaves its entries intact with the link cleared.

## Alternatives considered

- **Compute live from the food.** No duplicated data, and history rewrites itself on every import,
  edit and recipe change, and an entry dies with its food.
- **Version every food.** An entry points at an immutable food revision. Exact, and each monthly
  import writes a new revision for every product that changed, hundreds of thousands of rows that
  only the diary ever reads at one point in time.
- **Snapshot into wide columns, one per nutrient, as foods are stored.** SQL could sum totals over a
  range directly, and every new nutrient in the canon would be a migration on the diary as well.
  Totals at this scale are cheap to sum in `lib/domain/`, which is also where they are tested.

## Consequences

- History is stable: re-importing reference data, editing a food or editing a recipe changes
  future entries only. That is pinned by a router test in #27.
- A corrected food does not fix the past. A user who wants an old entry recomputed edits its
  quantity, or logs it again.
- Totals over a range read every entry in it and sum in TypeScript. That is the aggregation path
  for trends and reports (#53), so a slow trends page is the signal that this has stopped scaling.
- A nutrient added to the canon later is absent from older entries, and a total over a period that
  spans the change reports it as partial, not as low.
- The snapshot is the nutrient data an export (#56) writes, so an export reproduces exactly what the
  user saw.

## Revisit trigger

Users asking for a correction to a food to flow into past entries, or summing snapshots in
TypeScript becoming the bottleneck for a trends range.
