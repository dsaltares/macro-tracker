# Data sources

The reference foods come from these open datasets. Each one is imported as published, mapped to
the nutrient canon ([`DOMAIN.md`](DOMAIN.md) § Foods), and attributed here; the app's footer links
to this page.

## Open Food Facts

- **What:** barcoded products sold in Europe, from the daily CSV export.
- **Where:** <https://world.openfoodfacts.org/data>
- **Licence:** database under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/),
  contents under the [Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/),
  product images under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- **Attribution:** © Open Food Facts contributors. The foods table built from it is a derived
  database and stays under the ODbL.
- **Adapter:** `lib/data/sources/open-food-facts/`

## ANSES CIQUAL

- **What:** the French food composition table, 2025 edition: 3,484 generic foods and 74
  constituents. Foods that declare neither energy nor all of protein, carbohydrate and fat are
  left out (81 in 2025). Names are shown in English; the French name is kept and searched.
- **Where:** [doi:10.57745/RDMHWY](https://doi.org/10.57745/RDMHWY) on Recherche Data Gouv, also
  at <https://ciqual.anses.fr>.
- **Licence:** [Licence Ouverte / Open Licence 2.0 (Etalab)](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
- **Attribution:** Anses. 2025. Ciqual French food composition table.
  <https://ciqual.anses.fr/>. Values are imported as published, and kJ, salt and traces are
  normalised as described in [ADR 0005](adr/0005-import-reference-foods-in-the-server-open-food-facts-first.md).
  Energy for a food that declares only its macros is computed from them.
- **Adapter:** `lib/data/sources/ciqual/`

## McCance and Widdowson's CoFID

- **What:** the UK food composition table, the 2021 integrated dataset: 2,886 generic foods from
  its Proximates, Inorganics and Vitamins sheets, joined on the food code. "Tr" is a trace; "N"
  (present, amount unknown) and a blank are left out. A food CoFID gives no energy for keeps none,
  rather than one computed from the macros it has (33 in 2021: spices, stock cubes and a
  takeaway). The fatty-acid sheets break the totals in Proximates down by chain length, which the
  canon has no keys for, so they are not read. Alcoholic drinks are given per 100 ml and stored
  as per 100 g. The 2021 workbook gives code 13-669 to two foods; the first, aubergine, is kept
  and watercress is skipped with a warning.
- **Where:** <https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid>
- **Licence:** [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **Attribution:** Contains public sector information licensed under the Open Government Licence
  v3.0. Source: Public Health England, McCance and Widdowson's The Composition of Foods Integrated
  Dataset 2021.
- **Adapter:** `lib/data/sources/cofid/`
