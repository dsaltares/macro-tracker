# Data sources

The reference foods come from these datasets, under these licences. Each needs its attribution
wherever the app shows or exports their data.

| Source | Dataset | Licence | Adapter |
|---|---|---|---|
| `off` | [Open Food Facts](https://world.openfoodfacts.org/data), the daily CSV export | [Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/); individual contents under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/) | `lib/data/sources/open-food-facts/` |
| `cofid` | [McCance and Widdowson's The Composition of Foods Integrated Dataset 2021](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), Public Health England | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | `lib/data/sources/cofid/` |

## Attribution

- **Open Food Facts:** "Product data from Open Food Facts (openfoodfacts.org), available under
  the Open Database License." A database derived from it stays under the ODbL.
- **CoFID:** "Contains public sector information licensed under the Open Government Licence v3.0.
  Source: Public Health England, McCance and Widdowson's The Composition of Foods Integrated
  Dataset 2021."

## How each is read

- **CoFID.** The workbook's Proximates, Inorganics and Vitamins sheets, joined on the food code
  and mapped column by column in `cofid/mapping.ts`. "Tr" is a trace; "N" (present, amount
  unknown) and a blank are left out. A food with no energy keeps none, rather than one guessed
  from the macros it has. The fatty-acid sheets break the totals in Proximates down by chain
  length, which the canon has no keys for, so they are not read. Alcoholic drinks are given per
  100 ml and stored as per 100 g. The 2021 workbook gives code 13-669 to two foods; the first,
  aubergine, is kept and watercress is skipped with a warning.
