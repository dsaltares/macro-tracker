# 0005 — Import reference foods inside the server, Open Food Facts first, through one adapter contract

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #11, #12, #13, #14, #15, #16, #17, #19, #67, [ADR 0001](0001-one-container-sqlite-on-a-volume.md), [ADR 0003](0003-diary-entries-snapshot-their-nutrients.md), [ADR 0004](0004-one-canonical-nutrient-vector-per-100-g-in-wide-columns.md), [`docs/DOMAIN.md`](../DOMAIN.md) § Foods

## Context

The app is only as useful as the food someone finds when they scan a barcode in a supermarket or
type "chicken breast" in a kitchen. Two kinds of data answer those two questions.

- **Barcoded products.** Open Food Facts is the only open, crowd-maintained product database with
  European coverage at scale: millions of products, under the ODbL, with a daily full export (a
  gzipped CSV of several GB, nutriments as flat `*_100g` columns) and a per-product JSON API. It is
  also noisy: invalid barcodes, products with no nutrition facts, values in the wrong unit, labels
  edited between two runs. Most of its products are sold outside Europe, where nobody using this
  app shops.
- **Generic foods.** CIQUAL (France, Licence Ouverte), CoFID (UK, OGL v3) and USDA FoodData Central
  (public domain) are curated composition tables of a few thousand foods each, with far more
  micronutrients than any label, released every year or two.

Each source has its own format, its own nutrient keys and units (ADR 0004), and its own way of
saying "below the detection limit" (`<`, "traces", "Tr"). The data changes upstream on its own
schedule; a product that disappears from Open Food Facts may still be in someone's diary.

The app runs as one process with SQLite on a volume (ADR 0001), and there is no admin interface.

## Decision

- **Open Food Facts is the primary source** for barcoded products. The bulk import keeps a product
  only if its code is a valid EAN-8 or EAN-13 (UPC-A normalised), it declares energy and at least
  one macro, and its `countries_tags` include a European country (the list is
  `lib/domain/foods/countries.ts`, #12). A barcode missed locally falls back to the live API
  (#19). CIQUAL, CoFID and USDA supply generic foods, and a user chooses which of them appear in
  their search.
- **One adapter contract.** A source adapter is a `FoodSource` (`lib/data/sources/types.ts`):
  `{ id, fetch(context) }`, where `fetch` returns an `AsyncIterable<SourceFood>` and the context
  carries a `fetch` function, a temporary directory on the volume, a logger and an abort signal.
  An adapter streams and maps its upstream; it never touches SQLite. A `SourceFood`
  (`lib/domain/foods/source-food.ts`) is validated by one Zod schema: canonical nutrient keys per
  100 g, the barcode, name, brand, quantity, upstream portions, upstream last-modified time, and
  the nutrients the source declared as a **trace**. The normalisation every adapter needs (kJ to
  kcal, salt to sodium, `<` and "traces" to a flagged zero, per-serving values to 100 g, energy from
  the macros when none is declared) lives there once, at 100% coverage.
- **Ingestion runs inside the server process** (#13), streaming each adapter into SQLite in short
  batched transactions with a yield between batches, triggered by a token-protected endpoint and a
  monthly in-process cron (#14). No GitHub Actions and no second process in the data path.
- **Upsert on `(source, source_id)`.** A reference food's identity is its upstream id: an Open
  Food Facts `code` as published (the barcode column holds the normalised EAN), a CIQUAL, CoFID or
  USDA food code. Re-importing unchanged data changes nothing.
- **Archive on disappearance, never delete.** A reference food that a complete run of its source
  no longer emits gets `archived_at`: hidden from search, still resolvable by id, so diary entries
  and recipes that point at it keep working. Their nutrients are snapshots anyway (ADR 0003).
- **A fixture source stands in for upstream** in tests, end-to-end runs and local development:
  `test/fixtures/foods/sample.jsonl` holds Open Food Facts–shaped products (mapped through the same
  table as the real adapter) and generic foods with full micronutrients, read by
  `lib/data/sources/fixture.ts`.

## Alternatives considered

- **All of Open Food Facts, no country filter.** Several times the rows, the database and the
  import time for products nobody here can buy, and noisier search results.
- **The Open Food Facts API only, no bulk import.** No offline search, a network call on every
  lookup, and the API's rate limits on the hot path. Kept as the fallback for a barcode miss.
- **Import in GitHub Actions or a separate worker, shipping a database file.** Keeps import load
  off the request process, and adds a second writer or a database swap on deploy, plus somewhere to
  keep multi-GB artifacts. The importer takes no request context, so it can move to a worker thread
  later without changing adapters.
- **Delete what disappears upstream.** Simpler, and breaks every diary entry, favourite and recipe
  that points at the food.
- **Key Open Food Facts products by normalised barcode.** Upstream sometimes holds the same product
  under a UPC-A and an EAN-13 code; keying by the code as published keeps the upsert one-to-one
  with upstream rows.

## Consequences

- Every source is an adapter plus a mapping table whose test pins every key it reads; a new
  upstream key fails that test until it is mapped or deliberately ignored.
- Imports compete with requests for the one SQLite writer: batches stay small, and the import is
  measured against `health` latency on the homelab (#13).
- Archived foods accumulate. That is the price of never breaking a diary.
- Open Food Facts data is under the ODbL, so attribution ships with the app (`docs/DATA-SOURCES.md`,
  #15) and a derived database stays under it.
- Tests, e2e and local development never download anything; they import the fixture.

## Revisit trigger

A full Open Food Facts import that cannot finish without visibly degrading requests on the homelab,
the European filter excluding products users report scanning, or a source whose upstream ids are
not stable across releases.
