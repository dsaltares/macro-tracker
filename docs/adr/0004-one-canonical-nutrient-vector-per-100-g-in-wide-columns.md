# 0004 — Store one canonical nutrient vector per 100 g, in wide columns, with sodium canonical

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #9, #10, #11, #12, #15, #16, #17, #67, [ADR 0003](0003-diary-entries-snapshot-their-nutrients.md), [`docs/DOMAIN.md`](../DOMAIN.md) § Nutrients

## Context

Four upstream datasets describe foods, and none of them agrees with another on what a nutrient is
called, which unit it is in or what quantity it is given for.

- **Open Food Facts** (#12) has free-form `nutriments` keys (`energy-kcal_100g`, `salt_100g`,
  `sodium_100g`, `vitamin-c_100g`), in grams whatever the nutrient, per 100 g and sometimes only per
  serving. A label declares salt, not sodium; some products carry both and they disagree; others
  give energy only in kJ.
- **CIQUAL** (#15), **CoFID** (#16) and **USDA** (#17) each number their own constituents, in their
  own units, per 100 g of edible portion, and declare sodium, not salt.
- Users type a label in by hand, and a label scan (M5) reads one: energy in kcal and kJ, salt, per
  100 g and per serving.

Everything downstream — the diary snapshot (ADR 0003), totals, goals, recipes, trends, the export
and the API — wants one shape it can add up without asking where a number came from.

Foods are many (Open Food Facts alone is hundreds of thousands of European products) and written
almost only by the importer; they are read one at a time, by id, barcode or search hit.

## Decision

- **One canon.** The closed list in `lib/domain/nutrition/nutrients.ts`: a key, a unit (`kcal`,
  `g`, `mg`, `µg`), a group and a display order for every nutrient. Every source adapter maps into
  it at the edge (#11); nothing past an adapter sees an upstream key or unit. A nutrient outside
  the canon is dropped, not stored under a free-text key.
- **Per 100 g.** A food's vector is always per 100 g. Per-serving-only upstream values are scaled
  on the way in, and a portion is grams, so every quantity resolves through `forGrams`.
- **Wide columns.** `food_nutrients` has one nullable `REAL` column per canonical nutrient (#10).
  `NULL` means unknown, never zero, and reads back as an absent key in a `NutrientVector`. The
  column list is generated from `nutrientKeys` in a test, so the two cannot drift.
- **Sodium is canonical; salt is derived** at × 2.5 (`salt(sodiumMg)`), and only for display and
  label entry. A source that declares only salt is converted with `sodium(saltG)`. A source that
  declares both keeps its sodium.
- **kcal is canonical; kJ is derived** at × 4.184. A source with no energy gets
  `kcalFromMacros` (4/4/9/7 for protein, carbohydrate, fat, alcohol) at import.
- Display rounding is in one place, `format.ts`; stored values are never rounded.

## Alternatives considered

- **A JSON column per food**, as the diary snapshot is. Adding a nutrient would not be a migration,
  but the canon is closed on purpose, and SQLite could no longer check types, filter or sort on a
  nutrient ("high protein") without parsing every row.
- **An entity–attribute–value table** (`food_id, nutrient, amount`). Flexible, and around fifty
  rows per food, hundreds of thousands of foods, and a pivot on every read.
- **Keep upstream units and keys, normalise on read.** No information lost at import, and every
  reader would have to know every source. The mapping belongs in the one place each source enters.
- **Salt canonical**, because that is what an EU label says. Every generic table, every DRV
  (EFSA, #41) and every mineral panel speaks sodium in mg, and salt is a fixed multiple of it.

## Consequences

- Adding a nutrient is a canon entry, a migration adding its column and, for each source that
  carries it, a mapping line. Entries logged before it lack it, and totals over the change report
  it as partial (ADR 0003).
- A salt value round-tripped through sodium may not print back exactly as the label did, after
  rounding. That is accepted; sodium is what the app adds up.
- Adapters carry the burden of unit conversion and must be tested against real upstream rows
  (#11's mapping test fails on an unmapped key).
- The diary snapshot stays JSON (ADR 0003): it is read per entry and summed in TypeScript, so it
  gains nothing from columns.

## Revisit trigger

A source we want to import carries nutrients the canon cannot express without changing what a key
means (a different basis than per 100 g, or a nutrient with several incompatible units), or
`food_nutrients` growing past SQLite's comfortable column count because the canon has.
