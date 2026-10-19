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

## USDA FoodData Central

- **What:** generic foods from three datasets: Foundation Foods (2026-04-30 release) and SR Legacy
  (April 2018, final) for nutrient depth, and the Food and Nutrient Database for Dietary Studies
  (FNDDS 2021–2023, released 2024-10-31) for household portions. A food in both Foundation and SR
  Legacy is one food, Foundation's values first. Branded Foods is not imported.
- **Where:** <https://fdc.nal.usda.gov/download-datasets/>
- **Licence:** public domain, published under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). USDA asks to be cited.
- **Attribution:** U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.
  <https://fdc.nal.usda.gov>.
- **Adapter:** `lib/data/sources/usda/`
