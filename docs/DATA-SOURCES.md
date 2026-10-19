# Data sources

Every reference food comes from one of these sources, imported by its adapter in
`lib/data/sources/` (ADR [0005](adr/0005-import-reference-foods-in-the-server-open-food-facts-first.md)).
Each entry says what is imported, under which licence, and the attribution the source asks for.

## Open Food Facts

- **What:** barcoded products sold in Europe, from the daily CSV export.
- **Where:** <https://world.openfoodfacts.org/data>
- **Licence:** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
  for the database, [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/)
  for its contents. A database derived from it stays under the ODbL.
- **Attribution:** Data from Open Food Facts, © Open Food Facts contributors,
  <https://openfoodfacts.org>.

## USDA FoodData Central

- **What:** generic foods from three datasets: Foundation Foods (2026-04-30 release) and SR Legacy
  (April 2018, final) for nutrient depth, and the Food and Nutrient Database for Dietary Studies
  (FNDDS 2021–2023, released 2024-10-31) for household portions. Branded Foods is not imported.
- **Where:** <https://fdc.nal.usda.gov/download-datasets/>
- **Licence:** public domain, published under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). USDA asks to be cited.
- **Attribution:** U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.
  <https://fdc.nal.usda.gov>.
