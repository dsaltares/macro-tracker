# AGENTS

Food macro and micronutrient tracker, a mobile-first installable PWA, self-hosted.
TS (strict), Yarn 4, Node 24, Next.js 16 App Router, React 19.

## Commands

- `yarn dev` — `yarn db:seed`, then the dev server on 3014 · `yarn build` · `yarn start`
- `yarn build:import-worker` — bundle the food import's worker thread (`lib/data/import-worker.ts`)
  into `build/import-worker.mjs` with esbuild, for the image, which names it in `FOOD_IMPORT_WORKER`
- `yarn bundle:budget [dist-dir]` — after `yarn build`, each route's first-load JS, gzipped (the
  root chunks and every chunk its client reference manifest lists, `scripts/bundle-size.ts`),
  failing when one is over `firstLoadBudgetKb` (`scripts/bundle-budget.ts`). CI runs it after the
  build. `yarn bundle:analyze` is Next's interactive analyzer, for finding what a chunk holds
- `yarn typecheck` · `yarn lint` · `yarn format`
- `yarn test` — the `unit` project under coverage, then the `ui` project · `yarn test:watch` runs
  both. `vitest run --project ui <path>` narrows to one file.
- `yarn test:real-ai` — the `real-ai` project: the label reader against the photos in
  `test/fixtures/labels/` through the real model of `AI_PROVIDER`, `AI_MODEL` and `AI_API_KEY`
  (read from `.env`), printing a table of each photo's fields read right, and failing under 90% on
  the EU mandatory fields per 100 g. Skipped without a key, never run by `yarn test`, `yarn
  test:watch` or CI, and every run costs money
- `yarn test:e2e` — Playwright against a production build of its own (`next build` then
  `next start`, in `.next-e2e` on 3015), never a server already running; `E2E_PORT` moves it when
  another worktree holds 3015. `yarn test:e2e:dev` runs it against `next dev` instead, for hot
  reload while writing a spec. First time on a machine: `yarn playwright install chromium`.
- `yarn db:migrate` — apply outstanding migrations to `DATABASE_URL` · `yarn db:migrate down`
  rolls one back
- `yarn db:import-foods [--source off,ciqual,…] [--fixture]` — run the importer against
  `DATABASE_URL` after migrating it: the named source adapters, every registered one when none is
  named, or the fixture alone. Refused while another import is running. `off-deltas` is only ever
  run by name
- `yarn db:seed` — migrate `DATABASE_URL`, create the dev user (`dev@example.test`, password
  `macro-tracker-dev`, confirmed, with a profile) when it is not there, and import the fixture when
  there are no reference foods, so a fresh clone can sign in and search. Refuses under
  `NODE_ENV=production`
- `yarn db:backup` — copy the database with SQLite's online backup into `backups/` beside it
  (`BACKUP_DIR` overrides), keeping the last ten
- `yarn data:sample` — rebuild `test/fixtures/off/sample.csv`, the trimmed Open Food Facts export
  the adapter's test reads, from `test/fixtures/foods/sample.jsonl`. Run it after changing either
  that fixture or `test/fixtures/off/export-header.tsv`; a test fails until you do
- `yarn data:off` — stream the real Open Food Facts export through the adapter without writing
  anything, and print what it kept, the bytes, wall time and peak memory. An optional URL argument
  reads another export
- `yarn data:off-deltas [since]` — the same for the Open Food Facts deltas: every listed file, or
  those after an optional ISO time
- `yarn data:cofid-sample [url-or-path]` — rebuild `test/fixtures/cofid/sample.xlsx`, the trimmed
  CoFID workbook the adapter's tests read, from the real one: its three header rows and the foods
  whose codes `scripts/cofid-sample.ts` lists
- `yarn data:usda` — download the three USDA FoodData Central archives and read them through the
  adapter without writing anything, and print the foods, portions, wall time and peak memory
- `yarn db:copy-down` — replace the local database and `.env` with production's, straight over
  SSH: an online backup taken in the running container and the environment the service runs with,
  over `ssh homelab` in the compose project named by `DEPLOY_COMPOSE_DIR` and `DEPLOY_SERVICE`.
  Each of those three is read from the environment, then `~/.config/macro-tracker/env`; the deploy
  variables then fall back to `gh variable get`, so it works from any worktree.
  `scripts/local-env.ts` turns production's environment into the `.env`: production's secrets
  plus the local settings production lacks, `DATABASE_URL` pointed at this machine, the
  container's paths and mode dropped. What each replaces is kept as `<file>.before-copy-down`;
  stop `yarn dev` first. The copy holds real diaries and the reference food tables. It refuses to
  run under `NODE_ENV=production`
- `yarn env:copy-down` — the `.env` half of `yarn db:copy-down`: production's environment over
  the same SSH connection, turned into the `.env` by `scripts/local-env.ts` with this machine's
  `DATABASE_URL`, leaving the database alone. The old `.env` is kept as `.env.before-copy-down`.
  Both share `scripts/production.ts`. It refuses to run under `NODE_ENV=production`
- `yarn db:link` — in a worktree, symlink `.env` and the database's directory (`.data`, so its
  `-wal`, `-shm` and backups come along) to the main checkout's, found through
  `git rev-parse --git-common-dir`, so every worktree runs against the same data. A real file or
  directory already there is kept as `<path>.before-link`; an old link is replaced. Refuses in the
  main checkout

## Modules

- `lib/brand.ts` — the app's name, short name, description and background colours. Every place
  that names the app or paints its background reads them from here.
- `lib/domain/nutrition/` — the nutrient canon (`nutrients.ts`), `NutrientVector` arithmetic
  (`vector.ts`) and display rounding (`format.ts`), ADR [0004](docs/adr/0004-one-canonical-nutrient-vector-per-100-g-in-wide-columns.md).
  Every amount the app adds up goes through `scale`, `sum` and `forGrams`; every amount it shows
  goes through `formatAmount`. Coverage on it is gated at 100%.
- `lib/domain/foods/` — `SourceFood`, the Zod schema every source adapter emits, and the
  normalisation they share (`source-food.ts`: kJ to kcal, salt to sodium, traces to a flagged
  zero, per serving to per 100 g); barcode validation and UPC-A to EAN-13 (`barcode.ts`). Coverage
  on it is gated at 100%.
- `lib/domain/profile.ts` — the profile's Zod schema, the activity levels and their multipliers,
  and `ageOn`. `profileSchemaOn(today)` adds the age bound (16 to 120), which needs a today, so
  the form passes the local day and `profile.upsert` checks it against the server's.
  `lib/db/profiles.ts` reads and saves it, one row per user keyed on `user_id`.
- `lib/domain/dates.ts` — dates as `YYYY-MM-DD`. `localDateOf(instant)` is the browser's day;
  `today(clock, timeZone)` is the day of `clock.now()` in a time zone. `addDays`, `daysBetween`
  and `isDate` work at UTC midnight, so a change of clocks never moves a day.
- `lib/domain/diary/entries.ts` — the meals in order and the entry kinds; `resolveEntry(food,
  portion, quantity)` and `quickEntryNutrients` resolve a snapshot, filling missing energy from
  the macros (`withEnergy`); `mealTotals` and `dayTotals` sum snapshots. Coverage on
  `lib/domain/diary/` is gated at 100%.
- `lib/domain/diary/meal-estimate.ts` — `mealEstimateSchema`, what the meal estimator answers:
  `items`, each `{ kind, name, grams, confidence, note }` with a `food` (`foodId`, an optional
  `portion` of `{ label, quantity }`), a `recipe` (`recipeId`, `servings` or null for the grams)
  or a `guess` (`nutrients`: energy and the three macros for the grams), and `notes`. Nullable,
  never optional, so strict structured outputs take it. `mealDraft(estimate, resolved)` resolves
  each item through `resolveEntry` over the `MatchedFood`s the caller found by id (a food's
  portion when it names one the food has, otherwise `1 g` times its grams; a recipe through
  `recipePortionOf`) or `quickEntryNutrients` for a guess, flags `unsure` by `isUnsure`, turns a
  food or recipe not in `resolved` into an `unresolved` guess with no nutrients, and sums the
  totals. `mealDraftToEntries(draft)` is the entries to add, one per item, by kind.
  `draftChanges(previous, revised)` marks each revised line `added`, `changed` or `unchanged`,
  matching each previous line once by food id, recipe id or a guess's name in any case, and
  comparing grams and nutrients. `maxFeedbackRounds` (3) is a sheet's feedback rounds.
- `lib/domain/recipes/` — `recipeNutrients(recipe, ingredients)` sums each ingredient's vector
  per 100 g at its grams (filling energy from the macros, as `resolveEntry` does) into the total,
  per serving and per 100 g over the cooked weight or else the ingredients' grams.
  `canNest(parent, child)` is the one-level rule over `NestingFacts`, which the write reads.
  `recipeAsFood` is the recipe as `resolveEntry` takes a food: the vector per 100 g and the
  portions `1 serving` and `100 g`; `recipePortionOf(portions, amount)` is the portion and
  quantity a number of servings or grams of it resolves through. Coverage on it is gated at 100%.
- `lib/domain/goals/` — derived goals (ADR [0011](docs/adr/0011-derive-goals-live-from-the-profile-and-the-latest-weight.md)).
  `energy.ts` is Mifflin-St Jeor `bmr` with the age on the date, `tdee`, `kcalTarget` at 7,700 kcal
  per kg and `energyWarnings`; `macros.ts` is `macroGoal`: protein by body weight, fat by share of
  energy, carbohydrate as the remainder floored at zero, fibre at 14 g per 1,000 kcal.
  `derivedGoal` (`derived.ts`) puts them together into a goal vector with its warnings, codes the
  UI words. `drv.ts` is the table of dietary reference values by sex and age band, sourced in
  `docs/DATA-SOURCES.md`; `defaultMicroGoals(profile, date, kcal)` reads it into a vector, scaling
  the values per MJ or share of energy by `kcal`, and `goalKind(key)` says whether a nutrient's
  goal is a `target` or an `upper` limit. `settings.ts` is the goal settings' schema and defaults;
  `goalOn(profile, weightKg, date, settings)` (`goal.ts`) is the goal vector for a date: the micro
  defaults at the goal's kcal, the derived energy and macros (none without a weight) or a manual
  goal's own, then the overrides. `progress.ts` is `progressOf` (under, near or over a goal, by its
  kind), `goalShare` and `nutrientProgress(totals, goal)`, a row per nutrient in display order
  that keeps a nutrient no entry declares apart from zero. Coverage on it is gated at 100%.
- `lib/domain/trends/aggregations.ts` — the trends over a range of dates: `dailyTotals` per date,
  flagging the dates with no entries, `trendDays` adding each date's `rollingAverage` over the
  seven ending on it (the entries read from `rollingWindowStart(from)`), `adherence` within 10% of
  the kcal goal and `nutrientAverages`, every average over the logged days alone. `goalsOn`
  (`lib/domain/goals/goal.ts`) is the goal on each date of a range from one read of the weights.
  `lib/db/trends.ts` puts them over `diaryEntries` (`lib/db/diary.ts`) and `findGoalsOver`
  (`lib/db/goals.ts`); the `trends` router is `range` and `nutrients` (`{ from, to }`, at most
  `maxTrendRangeDays`) over the caller; `nutrients` also counts each nutrient's `daysWithData`.
  Coverage on it is gated at 100%. `/trends/nutrients`, linked from the Trends summary, is `NutrientReport`
  (`components/nutrients/`): `trends.nutrients` over the last 7, 30 or 90 days or the last year,
  through `nutrientProgress`, by group or sorted by `byShare` (`lib/domain/goals/progress.ts`).
  It shares its rows with the nutrient panel (`nutrient-rows.tsx`), adding a note of the days with data.
- `lib/data/sources/` — source adapters, ADR [0005](docs/adr/0005-import-reference-foods-in-the-server-open-food-facts-first.md).
  A `FoodSource` (`types.ts`) is `{ id, emits, fetch(context) }` yielding `SourceFood`s of the
  sources in `emits`; it never touches SQLite. `open-food-facts/mapping.ts` is the one table from Open Food Facts nutriment keys to
  canonical ones; its test fails on any key in the real export header or real products
  (`test/fixtures/off/`) that is neither mapped nor ignored. `fixture.ts` reads
  `test/fixtures/foods/sample.jsonl` (Open Food Facts–shaped products, mapped through that table,
  and generic foods as `SourceFood`s) for tests, e2e and local development.
  `open-food-facts/export.ts` streams the gzipped CSV export (`fetch` → gunzip → lines, flat
  memory, nothing on disk) and keeps a product only if it is sold in a country of
  `lib/domain/foods/countries.ts`, has a valid barcode and declares energy and a macro per 100 g.
  An interrupted download resumes with a `Range` request pinned to the first response's ETag.
  `test/fixtures/off/export-header.tsv` is the real export's header; refresh it from upstream
  when the export changes shape.
  `open-food-facts/deltas.ts` (`off-deltas`, a delta source) reads `index.txt` of the daily delta
  files (gzipped JSONL, one per day for 14 days, each file name the Unix seconds it covers), and
  fetches, oldest first, every file that ends after the last succeeded `off-deltas` run started.
  Its products are in the newer nutrition schema: `nutrimentsFromNutrition` (`mapping.ts`) turns
  the `aggregated_set` into the `*_100g` keys the CSV has, leaving out what Open Food Facts
  estimated from the ingredients, so both go through the same table and the same filters
  (`products.ts`). `test/fixtures/off/delta.jsonl` is twenty real products from one delta,
  trimmed to the fields the adapter reads, that between them carry every nutrient key that day.
  `ciqual/table.ts` asks Recherche Data Gouv for the latest version of the CIQUAL 2025 dataset,
  reads `alim_*.xml` for the English and French names, then streams `compo_*.xml`, which is
  grouped by food, and emits each food that declares energy or all three energy macros. The
  English name is the name; the French one is the `originalName`, which `foods_fts` indexes.
  `ciqual/mapping.ts` is the table from constituent codes to canonical keys. Its test fails on any
  code in `test/fixtures/ciqual/const.xml` (the real constituent list) that is neither mapped nor
  ignored, or whose unit is not the canon's. `alim.xml` and `compo.xml` beside it are seven real
  foods, cut verbatim from the release (CRLF and BOM, so `.gitattributes` exempts them). A new
  edition is a new dataset DOI in `ciqualDatasetDoi`. Every source's attribution is in
  `docs/DATA-SOURCES.md`, which the footer links to.
  `cofid/workbook.ts` downloads the CoFID 2021 workbook (4.6 MB, read whole with
  `read-excel-file`) and joins its Proximates, Inorganics and Vitamins sheets on the food code;
  `cofid/mapping.ts` is its column table, whose test fails on any column of those sheets that is
  neither mapped nor ignored.
  `usda/fooddata-central.ts` downloads the Foundation, SR Legacy and FNDDS CSV archives (zips of a
  few MB, read in memory by `usda/zip.ts` and `usda/csv.ts`; the release is in the URL, so a new
  USDA release is a change to `usdaDatasetUrls`). Foods are keyed `ndb:<NDB number>` and
  `fndds:<food code>`, never by `fdc_id`, which changes when USDA re-releases a food. A food in
  both Foundation and SR Legacy (same NDB number) is one food: Foundation's name and nutrients,
  SR Legacy filling each nutrient Foundation does not declare, both sets of portions. An FNDDS food
  made of one ingredient with no retention code lends its portions to the food with that NDB
  number and is not emitted itself.
  `usda/mapping.ts` maps USDA nutrient numbers (`nutrient_nbr`, the one id all three datasets
  share) to canonical keys and takes fibre out of carbohydrate by difference; its test fails on
  any number the fixtures in `test/fixtures/usda/` read that is neither mapped nor ignored. Those
  fixtures are real rows, trimmed to foods that between them read every number the full
  datasets use; the adapter warns at run time about any new one.
- `lib/data/import-foods.ts` — the importer. `importFoods({ db, sources, clock, logger, signal,
  workDir })` streams each `FoodSource` into `upsertFoods` in batches of 2,000, one transaction
  per batch and a yield to the event loop between them, then, for a `full` source, archives the
  foods of the sources that adapter `emits` that the run did not see. A `delta` source only
  upserts. Each source is handed `lastSucceededAt`, the start of the last succeeded run that read
  it. It takes no request context. A run is a row in
  `food_imports` (`lib/db/food-imports.ts`), kept current after every batch; a partial unique
  index allows one `running` row, which is the lock, and a second run is answered with it.
  `instrumentation.ts` fails a row still `running` at boot as `interrupted`. "Seen" is an
  `updated_at` at or after the run's start: every upsert writes it. `launchFoodImport` answers
  once the row exists, with a `finished` promise; `importFoods` awaits it. The adapters the CLI,
  the endpoint and the schedule can name are in `lib/data/sources/registry.ts` (`chooseSources`);
  naming none means every `full` one.
- `lib/data/background-import.ts` — `serverFoodImport(sources)` starts a run that outlives the
  request on a worker thread (`import-worker.ts`) with a connection of its own, opened with
  `bulkWrites`, answering once the run's row exists: the one code path behind the endpoint and the
  schedule. better-sqlite3 is synchronous, so a run on the main thread would stall every request.
  Next doesn't bundle a worker's entry: the image runs `build/import-worker.mjs` (named in
  `FOOD_IMPORT_WORKER`), anywhere else Node runs the source. `importFoodsInBackground` is the same
  launch in-process, for tests over an in-memory database. `lib/data/seed-foods.ts` imports the fixture into a database with no reference foods,
  for `yarn db:seed` and `e2e/prepare-database.ts`.
- `lib/data/food-import-schedule.ts` — the in-process schedules (`croner`). `FOOD_IMPORT_CRON` is
  the pattern of the full import, every `full` source; unset means the first Sunday of the month
  at 03:00 server time. `FOOD_DELTA_CRON` is the pattern of the delta import, every `delta`
  source; unset means every day at 04:00. Empty means off, and both are always off under Vitest.
  The e2e server and the `.env` `yarn db:copy-down` writes set both empty.
- `lib/internal-api/` — `POST /api/internal/imports/foods` (`{ sources? }`, every `full`
  adapter when absent, `['off-deltas']` for the deltas) answers `202` with the new `food_imports` row, or `409` with
  the running one;
  `GET` lists the last 20 runs. Both answer `404`, with no body, unless the request carries
  `Authorization: Bearer <INTERNAL_API_TOKEN>`, and always while that variable is unset. Operator
  plumbing, not part of `/api/v1`. The route in `app/api/internal/` only wires it to the server.
- `lib/db/` — SQLite through Kysely (ADR [0001](docs/adr/0001-one-container-sqlite-on-a-volume.md)).
  `createDatabase(url, { bulkWrites })` opens a connection with WAL, foreign keys, a busy timeout
  and a 64 MB WAL size limit; `bulkWrites`, for the importer's connection, adds a 256 MB page
  cache and `synchronous = NORMAL`. Ids are `v7` from `uuid`: they sort in the order they were made,
  so inserts append to the indexes on them instead of scattering;
  `DATABASE_URL` is read in `url.ts` and nowhere else. The typed `Database` is in `schema.ts`.
  Migrations are an ordered map of static imports in `migrator.ts`, never a directory read —
  `output: 'standalone'` traces modules, not directories. Add a migration, never edit one that has
  shipped. An index needs a plan, not a hunch: `query-plans.test.ts` runs `EXPLAIN QUERY PLAN`
  over the real statements and asserts no `SCAN` on the tables each names.
- `lib/db/foods.ts` — writes foods, their nutrients and portions in one transaction:
  `insertFood` for one, `upsertFoods` for an importer batch on `(source, source_id)`, keeping
  upstream portions by label and never touching user portions. `food_nutrients` has one column
  per canonical nutrient; a new nutrient is a new migration, and `foods.test.ts` fails until there
  is one. `foods_fts` is external-content FTS5 over `name`, `brand` and `original_name`, kept in
  step by triggers.
- `lib/db/food-search.ts` — the food reads behind `food.search`, `food.get` and `food.byBarcode`
  (through `lib/services/foods.ts`),
  over a `FoodReader` (`db` and the caller's `userId`, `null` when nobody is signed in). Search is
  FTS5 `MATCH` built by `matchExpression` (`lib/domain/foods/search.ts`), ranked the
  caller's own foods first, then by how the name matches (`matchTier`: the query's words exactly,
  the name starting with them, every word whole, then only as prefixes), then by `bm25` with the
  name and original name weighted over the brand, offset-paged 30 at a
  time. Every search logs its match, cursor, rows and milliseconds at debug level, which
  production's `info` level leaves out. A user food is visible only through `owner_user_id` on the statement; user portions only
  through `user_id`. `food-source-preferences.ts` lists the reference sources with their live
  food counts and saves a user's generic source preferences; search drops a disabled source in a
  subquery on the same statement.
  `food.mine` (`listUserFoods`) is the caller's live foods by name, or matching a query, paged
  the same way. `user-foods.ts` creates, updates and archives a user food over
  `userFoodSchema` (`lib/domain/foods/user-food.ts`): per 100 g, each amount at most what 100 g
  holds in its unit, a barcode normalised and no other live food of the owner's with it, and the
  portions, which an update replaces. `food.create`, `food.update` and `food.archive` are these
  over the caller; an update or archive of anything but the caller's live food is `NOT_FOUND`.
  `food-portions.ts` adds and removes a user's portions: an add reads the food through the same
  visibility as `food.get` and refuses a label the food already shows that user; a remove deletes
  only on `source = 'user'` and the caller's `user_id`. `food.get` returns stored portions with
  their `id` and `source`, the standard ones without.
- `lib/db/diary.ts` — diary entries and favourites (ADR [0003](docs/adr/0003-diary-entries-snapshot-their-nutrients.md)).
  `diary_entries` keeps each entry's snapshot as a JSON object in `nutrients`, and its checks
  enforce the shape of each kind: only a food entry links a food, only a recipe entry a recipe,
  and only a quick entry has no quantity, portion or grams. Deleting a food clears `food_id` and
  keeps the entry; `recipe_id` has no foreign key, since a recipe is archived and only an account
  deletion, which takes the entries too, deletes one. `diaryDay` reads a
  user's date on `(user_id, date)` and orders it by meal, then logging time. `logFood` reads the
  food through the same visibility as `food.get` and resolves the portion by label among the ones
  it shows the caller. `updateDiaryEntry` re-resolves the snapshot from the current food only on
  a quantity or portion change, keeping the logged weight of a portion the food no longer has;
  a move keeps it. `copyDiaryMeal` copies snapshots as they are, and `copyDiaryEntry` one entry's; `clearDiaryMeal` deletes one
  meal of a date. `logQuickEntry`
  logs a quick entry and, given amounts per 100 g to save, the caller's user food of the same name
  in the same transaction (`writeFood`, `insertFood`'s body); the entry stays a quick entry. The `diary` router
  (`lib/trpc/routers/diary.ts`) is these over the caller, through `lib/services/diary.ts` wherever
  `/api/v1` has the same behaviour. Adding a favourite
  reads the food through the same visibility as `food.get`; `food.setFavourite`
  (`{ foodId, favourite }`, idempotent) is it over the caller. `recentFoods`
  (`diary.recentFoods`), `frequentFoods` (`diary.frequentFoods`, the 90 days up to a date) and
  `favouriteFoods` (`food.favourites`) group the caller's food entries by food, the last logged
  amount coming from SQLite's bare columns beside a lone `max(created_at)`, and hand them to
  `withLastLoggedAmounts` (`food-search.ts`), which reads the summaries search shows and falls back
  to one default portion. Meals and entry kinds are in `lib/domain/diary/entries.ts`.
- `lib/db/recipes.ts` — recipes and their ingredients. `recipes` is one row per recipe, on
  `users.id` with a cascade; `recipe_ingredients` keeps each ingredient's `grams`, `portion_label`
  and `quantity` at a `position`, and links exactly one of `food_id` and `child_recipe_id`, never
  the recipe itself. Both links cascade, and the one-level nesting rule is the write's, not a
  constraint. `userRecipesQuery` lists a user's live recipes by name, `recipeQuery` reads one and
  `recipeIngredientsQuery` its ingredients in order, ownership on each statement. `findRecipe`
  resolves each ingredient from its current food (`findFood`) or recipe (`findRecipeFood`, the
  recipe as `recipeAsFood` with its name) into the recipe's nutrients; `recipeFieldsSchema`
  (`lib/domain/recipes/recipe-fields.ts`) is what a create or update takes. Every write is on the
  caller's live recipe. `addIngredient` resolves the grams from a portion label among the ones the
  food or nested recipe shows, appends it, and refuses a nested recipe `canNest` refuses, over
  nesting facts read in the same transaction, or one without ingredients; `updateIngredient`
  re-resolves the grams, keeping the saved weight of a portion the food no longer has;
  `reorderIngredients` takes every ingredient id exactly once. The `recipe` router
  (`lib/trpc/routers/recipe.ts`) is these over the caller. `logRecipe` (`diary.addRecipe`, servings
  or grams) snapshots `recipeAsFood` at `1 serving` or `100 g`, and `updateDiaryEntry`
  re-resolves a recipe entry from the current recipe the way it does a food entry.
- `lib/db/api-keys.ts` — API keys (ADR [0002](docs/adr/0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md)).
  `createApiKey` makes a key with `generateApiKey` (`lib/api/keys.ts`: `mt_` and 32 random bytes
  in base 62) and stores its `prefixOf` and SHA-256 `hashApiKey`, never the key, which it returns
  once; `listApiKeys` is the caller's live keys, newest first; `revokeApiKey` sets `revoked_at`
  on the caller's live key, keeping the row. `key_hash` is unique for the lookup `/api/v1` will
  make. The scopes are `apiKeyScopes` and a new key's schema `newApiKeySchema`
  (`lib/domain/api-keys.ts`), stored as a JSON array. The `apiKeys` router (`create`, `list`,
  `revoke`) is these over the caller. `ApiKeysSettings` (`components/settings/`) is Settings › API
  keys: the list with each key's prefix, scopes, creation and last use, revoked once confirmed;
  *New key* in the top bar (`SettingsPage`'s `end`) asks for a name and scopes in a dialog, then shows the new key in another
  to copy.
- `lib/api/` — the REST surface under `/api/v1` for API keys (ADR [0002](docs/adr/0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md)).
  `apiHandler({ scope, input, params, status, handle })` (`handler.ts`) authenticates the bearer
  key (`authenticate.ts`: by its hash, refusing a revoked one, writing `last_used_at` at most once
  a minute), checks the route's scope, validates the path parameters and the query or JSON body
  with Zod, and calls `handle` with a `ServiceContext` for the key's user; it returns
  `(server: ApiServer) => (request, { params })`, and `apiServer()` (`server.ts`) is the server's.
  Every error is `{ error: { code, message, issues? } }` (`errors.ts`); `handle` throws
  `apiError(code, message)` for an expected one. Pages are `{ items, nextCursor }` with an opaque
  cursor (`pagination.ts`). Routes are in `routes/` and tested there with the real handler over
  `migratedDatabasePerTest()`; each `app/api/v1/**/route.ts` only wires one to `apiServer()`, and
  `app/api/v1/[...path]` answers the envelope's `404` to any other path. A list reads one row past
  its page through a `Slice` (`lib/db/slice.ts`, `sliceAt` and `pageOfSlice`). `GET /api/v1/me` is
  the key's account, profile and the key's name, prefix and scopes. `routes/foods.ts` is
  `GET /api/v1/foods?q=&cursor=` (search, paged as `food.search`), `GET /api/v1/foods/{id}`,
  `GET /api/v1/foods/{id}/portions`, `GET /api/v1/foods/barcode/{ean}` (`400` on what is not an
  EAN-8, EAN-13 or UPC-A) and `POST /api/v1/foods` (`write`, a user food over `userFoodSchema`
  with `brand`, `barcode`, `quantityLabel` and `portions` optional, `201` with the food, `409`
  `CONFLICT` on a barcode the caller's foods already have). Every food carries
  `canonicalNutrients`: each canonical nutrient key in canon order, `null` where unknown. A
  portion is `{ id, label, grams, source }`, a standard one with `id: null` and
  `source: 'standard'`. The diary is `routes/diary.ts`:
  `GET /api/v1/diary/{date}` (`read`) is the day as `diary.day` has it; `POST
  /api/v1/diary/entries` (`write`, `201`) takes a `kind` of `food`, `recipe` (servings or grams)
  or `quick`; `PATCH` and `DELETE /api/v1/diary/entries/{id}` (`write`) change and remove one,
  and a new amount for an entry whose food or recipe is gone is `409` `CONFLICT`; `POST
  /api/v1/diary/copy` (`write`) copies a meal and answers `{ entries }`; `POST
  /api/v1/diary/entries/{id}/copy` (`write`, `201`, `{ toDate, toMeal }`) copies one entry, as
  `diary.copyEntry` does; `POST
  /api/v1/diary/meals` (`write`, `201`) logs a meal as `diary.addMeal` does and answers `{ entries }`,
  `404` naming the item whose food or recipe is gone. Each entry goes out through `entryOf`, its
  portion label as `portion`.
  `routes/body.ts` is
  `GET|POST /api/v1/measurements` (`metric`, default `weight_kg`, `from`, `to`, 100 a page; a
  `POST` answers `201` and replaces the date's weight) and `DELETE /api/v1/measurements/{id}`;
  `routes/goals.ts` is `GET /api/v1/goals?date=` (`{ date, settings, goal }`, the goal `goals.forDate`
  has, `null` without a profile or a weight) and `PUT /api/v1/goals` (the settings, as
  `goals.set`); `routes/recipes.ts` is `GET /api/v1/recipes` (live recipes by name, 50 a page)
  and `GET /api/v1/recipes/{id}` (as `recipe.get`, archived ones too); `routes/trends.ts` is
  `GET /api/v1/trends?from&to` (as `trends.range`). Reads need `read`, writes `write`.
  `test/rest.ts` is the routes' test client: `keyFor`, `call` and `app`, a tRPC caller over the
  same database.
  Every route also declares its `method`, `path` (OpenAPI style, `/foods/{id}`), `operationId`,
  `summary`, `description`, an `output` Zod schema its `handle` must return, the `errors` it can
  throw (each an `apiFailure(code, message)`, thrown as `failure()` and listed as itself) and an
  `example` of its params, input and response, which `apiHandler` exposes as `endpoint`.
  `lib/api/schemas.ts` holds the response schemas the routes share, each with an `id` in its
  meta so the document refers to it as a component. `lib/api/endpoints.ts` lists every route;
  `openApiDocument(endpoints, { serverUrl })` (`openapi.ts`) turns them into the OpenAPI 3.1
  document with Zod 4's `toJSONSchema`, request schemas in input mode and responses in output
  mode, the common errors on every operation and the route's own after them. `GET
  /api/v1/openapi.json` (`routes/openapi.ts`, no key needed) serves it, cached; `openapi.test.ts`
  validates it, checks every example against its schema, and fails when an
  `app/api/v1/**/route.ts` method has no operation or an operation no route. `/api/docs`
  (`docs.ts`) is Scalar over it, with the proxy, telemetry and hosted fonts off so the page makes
  no third-party request; the page is the bare markup Scalar's README shows, since its head
  manager trips over a `<noscript>` and leaves the loading skeleton. Its bundle is read from
  `node_modules/@scalar/api-reference` at request time and served at `/api/docs/scalar.js` with
  an ETag, which `next.config.ts` traces into the standalone output.
  `docs/API.md` is the hand-written guide: a key, a curl per endpoint, the envelope, pages and a
  note for agents; its examples are the routes' examples, so change both together.
- `lib/imports/` — history imports (ADR [0017](docs/adr/0017-import-a-history-from-cronometer-in-the-server-with-credentials-used-once.md)).
  `launchHistoryImport(context, { source, email, password, timeZone })` (`history-import.ts`)
  signs in to the source (a failure is `isCronometerFailure`, its message for the user), records a
  `history_imports` row (`lib/db/history-imports.ts`; one `running` per user, else it answers the
  running one) and runs the import after answering, with a `finished` promise: progress to the row,
  then `succeeded` with the summary or `failed` with a message, and a mail through
  `historyImportEmail` linking to `/settings/import`. The credentials are never stored; a restart
  fails a running row at boot (`instrumentation.ts`). The `historyImport` router is `start`
  (`BAD_REQUEST` for refused credentials, `CONFLICT` while one runs) and `latest`. `cronometer/`
  is the one source. `client.ts` is Cronometer's undocumented mobile API, ported from
  fitness-tracker: `login` (as the Android app, never sending a time zone), `diary(date)` (one day,
  its `Serving` entries), `foods(ids)` (50 a call) and `weights(range)` (the Weight metric in kg),
  signing in again once when a session expires. `test/cronometer.ts` fakes it for tests, as a
  `fetch` or an MSW handler. `cronometer.ts` reads its answers: nutrient ids are USDA nutrient
  numbers, read through `declaredFromUsda`; `servingOf` scales a food to a diary entry (per 100 g,
  or per serving for a `Recipe` measure); a `Recipe` food is weighed by its `g` measure;
  `USDAsr:` and `CoFID:` sources are reference ids. `account.ts` is the `Account` port over the
  caller's services. `planImport` walks the diary back from today a week at a time, past the dates
  the caller has logged without asking for them, until `emptyDaysBeforeHistoryStarts` (60) days
  have nothing, or `emptyDaysBeforeGivingUp` (365) before anything is found. It resolves each food:
  the reference food of its source id (`findFoodBySourceId`), else, searching its name, the
  caller's own food of the same name or a result naming every word of its product name, each only
  when energy, the three macros and any sugars, fibre and saturated fat both declare agree per
  100 g (`macrosAgree`, `match.ts`); otherwise a new food of the caller's own. Each serving is a
  food entry by the portion of its Cronometer measure, else `1 g`, unless its amounts per 100 g
  disagree with the food's, it is a quick add, or its food cannot be one of the caller's own
  (amounts over `maxPer100g`): then a quick entry of Cronometer's totals. Weights are the first of
  each date without one. `applyImport` creates the new foods and logs each meal through `logMeal`
  and the weights; `summaryOf` is what the row and the page keep. `ImportSettings`
  (`components/settings/`) is Settings › Import: the source, the email and password, *Import*,
  then `historyImport.latest` polled every second while it runs (the days read, then a progress
  bar), the summary and what each food became.
- `lib/services/` — what a tRPC procedure and a `/api/v1` route both call: a function over a
  `ServiceContext` (`context.ts`: `db`, a non-null `caller`, `now`, `nextId`). `findAccount`
  (`account.ts`) is behind `account.get` and `/api/v1/me`. `foods.ts` is search, a food by id or
  barcode, the nutrients of a page of foods and creating a user food, behind `food.search`,
  `food.get`, `food.byBarcode`, `food.create` and the foods routes; its reads take a
  `FoodReadContext`, whose caller may be null, since the app searches signed out too.
  `diary.ts` is the diary day, adding a food, recipe or quick entry, updating and removing one,
  copying a meal, and the Zod schemas of the fields both surfaces take (`dateSchema`,
  `mealSchema`, `timeSchema`, `quickNutrientsSchema`, `savingOnlyPer100g`, …). `body.ts`
  (with `measurementSchema`), `goals.ts`, `recipes.ts` (`listRecipes`, `findRecipe`) and
  `trends.ts` (`trendRange`, with `trendRangeSchema`) are behind the `body`, `goals`, `recipe`
  and `trends` procedures and their routes. `meal.ts` is `logMeal(context, { date, meal, time,
  items })`, behind `diary.addMeal` and `POST /api/v1/diary/meals`: the entries
  `mealDraftToEntries` gives (`mealToLogSchema`), written by `logMealEntries` (`lib/db/diary.ts`)
  in one transaction through the same writes as `logFood`, `logRecipe` and a quick entry, rolled
  back whole when any item's food or recipe is not the caller's to log, with that item's `index`.
  A `lib/db/` function moves behind a service when a REST route needs it too.
- `lib/db/body-measurements.ts` — the weight log: one row per user, metric and date (unique on
  `(user_id, metric, date)`, which also serves every read). `logMeasurement` upserts the day,
  keeping its id and `created_at`; `listMeasurements` reads an optional inclusive range, newest
  first; `findLatestMeasurement` is the latest on or before an optional date, the read ADR 0011
  needs. The `body` router (`lib/trpc/routers/body.ts`) is these over the caller. Metrics and the
  weight bounds (20 to 400 kg) are in `lib/domain/body/measurements.ts`; `body/trend.ts` is the
  trend weight (`weightTrend`, α = 0.1 a day, carried flat over days without a weight),
  `weeklyRate` and the chart's `trendRanges`. Coverage on `lib/domain/body/` is gated at 100%. The
  day view shows `LogWeightCard` (`components/body/`), below the meals, on today until today has a weight; `/body`,
  linked from Trends, is `WeightLog`, with `WeightChart` above the log: the weights and the trend
  weight in Recharts (through shadcn's `components/ui/chart.tsx`) over 30 days, 90 days, a year or
  all, hidden from screen readers behind a `figcaption` that sums it up. Recharts is only ever in
  a module loaded by `next/dynamic` (`weight-trend-chart.tsx`, `components/trends/trend-charts.tsx`),
  `ChartSkeleton` holding its place, so no page's first load carries it; the summaries are not.
- `lib/db/goals.ts` — the goal settings, one row per user in `goals` with the overrides as a JSON
  object, keeping no history; without a row they are `defaultGoalSettings`. `findGoalOn` reads the
  profile, the latest weight on or before the date and the settings, and hands them to `goalOn`.
  The `goals` router (`get`, `set`, `forDate`) is these over the caller. `GoalSettingsForm`
  (`components/goals/`) edits them on `/settings/goals` and at `/onboarding/goals`, the step after
  the profile. It previews the goal with `goalOn` as the settings change, from the profile and
  `body.latest`, and asks for a weight inline when a derived goal has none. The energy and macro
  overrides are the manual mode's inputs, and are dropped when a derived goal is saved; every
  other override is a micro goal's field, empty for its default. Nutrient names are
  `nutrientNames` (`components/nutrients/`).
- `lib/export/` — the export, session-authenticated route handlers in `app/api/export/`:
  `diary.csv` (one row per entry: date, meal, time, label, grams and a column per canonical
  nutrient) and `weights.csv`, both over an optional inclusive `from` and `to`, and `all.json`
  (`exportAccount` in `lib/db/export.ts`: profile, goal settings, the caller's own foods, every
  entry and every measurement). Each answers an attachment with `Cache-Control: no-store`, `401`
  without a session and `400` on a bad range. The CSV encoding (RFC 4180, CRLF, numbers to four
  decimals) is `lib/domain/export/csv.ts`; the routes prepend a byte order mark so spreadsheets
  read UTF-8. `exportSchema` (`lib/domain/export/schema.ts`) is the JSON's contract, versioned by
  `exportVersion`, for an import to parse. Recipes join it when they have a table.
  `ExportSettings` (`components/settings/`) is Settings › Export: a date range and the three
  downloads.
- `instrumentation.ts` — migrates the database to the latest version when the server boots, so
  the container needs nothing run before it, fails imports a restart interrupted, and starts the
  food import schedule. Anything else that must start with the server goes
  here too.
- `lib/auth/` — Better Auth (ADR [0006](docs/adr/0006-sessions-only-for-a-confirmed-address.md)).
  `createAuth({ db, secret, baseUrl, sendEmail, limitRequests })` over the Kysely instance, served
  at `app/api/auth/[...all]`; `getAuth()` is the server's. Its tables are `users`, `sessions`,
  `accounts` and `verifications`, snake_case, mapped field by field in `auth.ts`: a new Better Auth
  field needs its column there too. Email and password with a confirmed address required: sign-up
  mails a link and opens no session, the link confirms and signs in, a reset signs out every
  session. Google is on when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (`google.ts`)
  and links onto the user with the same address (ADR
  [0008](docs/adr/0008-link-google-to-the-account-on-the-same-confirmed-address.md)), confirming
  it and dropping its password if it was never confirmed; a password sign-in on a Google-only
  account answers `USES_GOOGLE`. A Google sign-in creates a user only with `termsAccepted` in its
  OAuth state, which the Create account button sends once its box is checked. `BETTER_AUTH_URL`
  is mandatory in production (`base-url.ts`); Better Auth's per-IP rate
  limit is on in production unless `DISABLE_AUTH_RATE_LIMIT=1`. Password rules and every form
  schema are in `credentials.ts`, shared by the forms and the server's limits. `resolveCaller`
  turns a confirmed session into the tRPC caller; `session.ts` reads it in a server component and
  `requireSession()` sends someone signed out to sign in and back;
  `requireProfile()` also sends an account without a profile to `/onboarding` and back. Both
  read the path to come back to from the `x-request-path` header `proxy.ts` sets on every page
  request, and are cached per request. The `app/(app)/` layout calls `requireProfile`, so every
  page in the group is behind it; a page calls it again only for the user or profile. `redirect.ts` keeps `next`
  inside the app and off the auth pages. `client.ts` is the browser client; component tests mock it
  with `test/auth-client.ts` and `next/navigation` with `test/next-navigation.ts`. The pages are in
  `app/(auth)/`, the forms in `components/auth/`. Sign-up requires consent (ADR
  [0009](docs/adr/0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md)): a body
  without `termsAccepted: true` is refused with `TERMS_NOT_ACCEPTED`, and the user is created with
  `terms_accepted_at`. `client.ts` declares `termsAccepted`, so `signUp.email` needs it to compile.
  `seed-dev-user.ts` writes the dev user of `dev-user.ts` through `lib/db/users.ts`, hashing with
  `better-auth/crypto`: it runs under plain Node, which cannot load `auth.ts`'s `.tsx` templates.
- Account deletion (ADR [0010](docs/adr/0010-delete-an-account-in-one-statement-that-cascades-through-the-schema.md)):
  `account.delete` (`lib/trpc/routers/account.ts`) takes the typed address and runs
  `deleteAccount` (`lib/db/accounts.ts`), one `delete from users` on the caller's id and that
  address. Everything else goes by `on delete cascade` on `users.id`, and the caller's own foods
  and portions by the `users_delete_owned_foods` trigger. A new table of user data references
  `users.id` with a cascade; `account.test.ts` checks nothing a user owns survives.
- Sign-in methods (ADR [0012](docs/adr/0012-manage-sign-in-methods-through-the-account-router.md)):
  `account.signInMethods`, `account.setPassword` and `account.disconnect` over
  `lib/db/sign-in-methods.ts`. Setting a password writes the credential row Better Auth's
  `setPassword` would, only when there is none; disconnecting deletes a method's row only while
  another exists. Connecting Google is Better Auth's `linkSocial` from the browser, back to
  `/settings/account`, whose `?error=` the page turns into copy (`googleLinkErrorMessage`).
  `components/settings/sign-in-methods.tsx` is the section on Settings › Account.
- `lib/email/` — `sendEmail` (ADR [0007](docs/adr/0007-mail-through-resend-behind-a-send-email-seam.md))
  takes a rendered `EmailMessage` and never throws: Resend with `RESEND_API_KEY` and `EMAIL_FROM`,
  otherwise a pino log of the message, link included. A reserved test address is never handed to
  Resend. With `EMAIL_OUTBOX_DIR` set, every message is also written there as JSON, which is how e2e
  follows mailed links (`e2e/auth.ts`). Templates are React Email in `templates/`, one
  `ActionEmail` layout for every message that is a link to follow.
- `lib/ai/` — the only module importing the Vercel AI SDK (ADR [0013](docs/adr/0013-read-labels-through-a-provider-agnostic-ai-seam-and-discard-the-photo.md)).
  `createLabelReader({ model })` over any `LanguageModel`; its `readLabel(image)` sends the bytes
  with `prompts/label.ts` and never throws: the `LabelReading`, or a failure (`unreadable`,
  `rejected`, `rate-limited`, `unavailable`) with a message, never the SDK's error, whose request
  holds the photo. The photo is never written or logged. `resolveLanguageModel` (`model.ts`) reads
  `AI_PROVIDER` (`openai`), `AI_MODEL` and `AI_API_KEY`, `null` without a key;
  `getLabelReader()` (`server.ts`) is the server's, `null` when label scanning is off. The prompt is
  tuned against `label-evals/`: `fixtures.ts` reads `test/fixtures/labels/`, a photo of a real
  label beside a JSON of its source and the `LabelReading` expected of it, transcribed by hand
  from the photo, never from the source's data; `score.ts` compares a reading to it field by field,
  amounts by value whatever the decimal separator or unit. The schema
  sent to the model drops `minLength` and `maxLength`, which strict structured outputs refuse; the
  answer is still validated by the Zod one (`strictOutput`, `structured-output.ts`, with the
  failures `failureOf` maps errors to). Tests drive it with `MockLanguageModelV4` from
  `ai/test`. `createMealEstimator({ model })` (`meal-estimator.ts`, ADR
  [0016](docs/adr/0016-estimate-meals-with-an-agent-over-the-users-own-search.md)) is
  `estimateMeal({ photos, description, foods, previous? })`, which never throws either: the
  `MealEstimate` or the same failures, one past `maxEstimatorSteps` (10) `unreadable`. It is a tool
  loop with `prompts/meal.ts` and two tools over `foods`, a `MealEstimatorFoods` port:
  `searchFoods` and `getFood`, each call logged at debug level with its query, never a photo.
  `mealEstimatorFoods({ db, userId })` (`lib/db/meal-estimator-foods.ts`) is the port over the
  caller: `searchFoods`' first page and the live recipes whose names hold every word
  (`nameMatchesEveryTerm`), and a live food with its portions. `resolveMealMatches` reads the live
  foods and live, non-empty recipes an estimate names, for `mealDraft`. `previous` is `{ draft, feedback }`,
  sent as the model's earlier answer and the user's correction; the photos are sent again.
  `getMealEstimator()` (`server.ts`) is the server's, `null` without a key. `LabelReading` and `labelReadingToFood` are in `lib/domain/foods/label-reading.ts`:
  the table as printed, each amount with its unit and a confidence, turned into a user food's
  fields per 100 g by `normaliseNutrients` and rounded as `per100gOfEntered` rounds, the values
  per 100 g winning over those per serving, the first of a nutrient read twice winning. It keeps
  the printed entry behind each nutrient (`printed`, `perServing`) for the form to show beside a
  value; `isUnsure` is a confidence below `unsureBelow` (0.8).
- `lib/label-scan/route.ts` — `POST /api/label-scan`, a route handler, not tRPC, since the body is
  bytes. `labelScanRoute({ readLabel, resolveCaller, logger })` answers `401` without a session,
  `503` while label scanning is off, `413` past 8 MB (`maxPhotoBytes`, by the declared length and
  again while reading the body), `415` for anything but a JPEG or WebP by its leading bytes, and
  otherwise the `LabelReading` or the reader's failure, logged without the photo. The route in
  `app/api/label-scan/` only wires it to the server. `lib/photo-upload.ts` holds what it shares
  with the meal estimate: `maxPhotoBytes`, `isJpegOrWebp`, `readUpTo` and `aiFailureStatuses`.
- `lib/meal-estimate/route.ts` — `POST /api/meal-estimate`, session-only like label scan.
  `mealEstimateRoute({ estimateMeal, resolveCaller, db, logger })` reads `multipart/form-data` of
  at most `maxMealEstimateBytes`: one to four `photos` (`maxMealPhotos`, in
  `lib/domain/diary/meal-estimate.ts` for the browser to read too), an optional
  `description` (`maxMealDescriptionLength`, 500) and an optional `previous` JSON
  (`previousEstimateSchema`, `lib/domain/diary/meal-estimate.ts`). It answers `401`, `503` while
  the estimator is off, `400` on a bad part, `413` for a photo over `maxPhotoBytes`, `415` for one
  that is not a JPEG or WebP, and otherwise the `MealDraft`, resolved on the server with
  `mealDraft` over `resolveMealMatches`, or the estimator's failure, logged without the photos.
  The route in `app/api/meal-estimate/` only wires it to the server.
- `components/label-scan/` — `LabelCapture`: *Take a photo* (a file input with
  `capture="environment"`) or *Choose a photo*, shrunk in the browser to 1,600 px on the long edge
  as WebP, JPEG where the browser cannot encode WebP (`shrinkPhoto`, `photo.ts`), sent with
  `XMLHttpRequest` for its upload progress (`uploadPhoto`), then *Reading the label…*, handing the
  reading to `onRead`. A failure that may pass offers *Try again* with the same photo; every failure
  offers another. Tests mock `photo.ts`, which needs a real canvas. `postWithProgress` there is
  the `XMLHttpRequest` both uploads share.
- `components/meal-estimate/` — `MealEstimate`, the sheet's step behind the camera button beside
  the barcode one while estimation is on (`getMealEstimator()`, passed down from the diary page
  as `mealEstimates`). It keeps the photos and description while it switches between
  `MealPhotoStep` (*Take a photo* or *Choose photos*, up to `maxMealPhotos`, each through
  `shrinkPhoto` with a thumbnail and remove, a description, *Estimate*: `requestMealEstimate`
  (`estimate.ts`) posts the form to `/api/meal-estimate` with upload progress, then *Looking at
  your meal…*; failures as `LabelCapture` shows them, *Try again* keeping the photos) and
  `MealDraftReview`: the totals of the draft over one row per item (name, source badge, *Recipe*
  or *Estimate*, grams, kcal), unsure and unresolved rows flagged *Check* with their notes. A
  row opens its amount (`draft-item-editors.tsx`: `EntryForm` with `amountOnly` for a food or a
  recipe, the guess's own totals form) and is rebuilt by `foodDraftItem`, `recipeDraftItem` or
  `guessDraftItem` (`lib/domain/diary/meal-estimate.ts`), no longer unsure (`checkedByUser`);
  *Replace* searches with the row's name and swaps it by `replacedDraftItem`, keeping the
  grams; *Add item* searches and appends; `draftOfItems` keeps the totals. *Log meal* is
  `diary.addMeal` of `mealDraftToEntries`, then a toast and the sheet closes. `MealFeedback`
  (`meal-feedback.tsx`) under the rows is *Ask for changes* and *Send*: the kept photos, the
  description and `previous` (the draft as edited and the feedback) through `requestMealEstimate`.
  `MealEstimate` counts the rounds, remounts the review on the revised draft with
  `draftChanges` marking rows *Changed* or *New*, and *Undo* brings back the draft that was sent;
  past `maxFeedbackRounds` the field is disabled and says so. Tests answer
  `/api/meal-estimate` with `serveApi().use(handler)` (MSW intercepts the upload).
- `lib/trpc/` — tRPC 11 over the fetch adapter at `app/api/trpc/[trpc]`. `createContext({ headers })`
  hands every procedure its database, `now()`, `nextId()` and `caller`, resolved from the session
  (`null` without a confirmed one), so tests swap any of them. Procedures live in `routers/`,
  mounted in `root.ts`. Components call them through `useTRPC()` and TanStack Query;
  `TRPCReactProvider` sits in the root layout. `accountProcedure` answers `UNAUTHORIZED` without a
  caller and hands the procedure a non-null one.
- `app/(app)/` — the app shell (`components/app-shell/`), behind `requireProfile`: the tabs of
  `appTabs` in `lib/navigation.ts` (Diary, Foods, Trends, Settings, the current one marked
  `aria-current="page"`) and safe-area padding. Below `md` the tabs are the bottom navigation
  (`BottomNav`) and the content is `max-w-md`; from `md` they are a `Sidebar` with the logo and
  the `AccountMenu` (`components/account/`: avatar, address, `accountLinks`, Sign out), and the
  content widens to `max-w-2xl`. Both navigations are labelled `Main`, and only one is ever
  displayed. Each page renders `AppPage`, whose `TopBar` takes the page's `title` (the `h1`) and
  optional `start` and `end` contents; without `start` it shows the logo below `md`.
  `loading.tsx` is a skeleton of a page; `error.tsx` renders `PageError` with a retry. `/`
  redirects to `/diary`. The app has no footer: `accountLinks` (the legal documents, Data sources
  and GitHub) are in the account menu, and below `md` in `AccountSummary` on the settings page.
- `app/(app)/settings/` — `/settings` lists `settingsSections` (`lib/navigation.ts`), each a live page
  or *Coming soon* until its milestone fills it; every section page renders in `SettingsPage`
  (`components/settings/`), whose top bar links back. The settings page also holds the theme
  (`ThemeSetting`), and below `md` the `AccountSummary`. Food sources edits the source preferences through
  `food.sources` and `food.setSourcePreferences`, saving every change as it is made.
- `app/(app)/diary/` — the day view, `DiaryDay` (`components/diary/`). The day is the `date` search
  parameter through nuqs (`NuqsAdapter` in the root layout, `NuqsTestingAdapter` in tests), absent
  for today, which is the browser's day and so only known after hydration (`useToday` in
  `components/use-today.ts`, `null` until then). The top bar steps a day
  either way and opens the native date picker; `diary.day` fills the day totals card (energy and
  macros, the rest of the EU label behind *More nutrients*) and the four meals, each with entries
  collapsible to its totals, which meals are collapsed held by `DiaryDay` across days. Tapping an entry
  opens `EditEntryDialog`, which sends `diary.update` only the fields that changed, since a
  quantity or portion re-resolves the snapshot, or deletes it. A meal's add button opens
  `FoodSearchSheet`, a bottom sheet for that meal: a search box `food.search` follows once typing
  pauses (`searchDebounceMs`), paged by `useInfiniteQuery` as the end of the list scrolls into
  view, and the Recent, Frequent, Favourites, All and Recipes tabs, typing moving to All unless on
  Recipes, which filters `recipe.list` by name. The All results are virtualised
  (`VirtualFoodList`, `@tanstack/react-virtual`, loaded by `next/dynamic`) in a scroll container
  of their own, each row carrying `aria-setsize` and `aria-posinset`. The sheet itself is loaded
  by `next/dynamic`, so the day view's first load leaves it out. The first three are
  `food-lists.tsx`: each row's add button logs the food's last logged amount to the sheet's
  date and meal in one tap, leaving the sheet open. Choosing a food
  opens `FoodStep` in the same sheet, which reads it with `food.get` and logs it with
  `diary.addFood`. Choosing a recipe opens `RecipeStep` (`recipe-step.tsx`), which reads it with
  `recipe.get` and logs servings or grams of it with `diary.addRecipe`, or offers to open a recipe
  without ingredients. `FoodStep` and `EditEntryDialog` share `EntryForm` (`entry-form.tsx`):
  quantity and portion, a live preview of the nutrients (`resolveEntry`, or an entry's snapshot
  until its amount changes), *Add portion* inline (`food.addPortion`), meal, time and the
  favourite toggle, the last two only for a food. A recipe entry is badged *Recipe* in its meal;
  its editor reads `recipe.get` for the portions and links to the recipe. *Quick add* opens `QuickAddStep` in the same sheet,
  named after the search: a label and either amounts per 100 g (the three macros, optional energy,
  and the grams eaten) or totals (energy or any macro), a live preview, meal and time, logged with
  `diary.addQuick`. Per 100 g, *Save as my food* also makes it a user food, so search finds it
  next time. Each entry's options button opens `EntryMenu` (`entry-menu.tsx`): *Copy*, which `DiaryDay`
  holds across days, and *Delete*. Each meal's options button opens `MealMenu` (`meal-menu.tsx`): *Paste* the copied entry
  (`diary.copyEntry`, its snapshot as it is), *Copy from
  yesterday* (`diary.copyMeal` from the day before into the same meal), *Copy to…* (a date,
  tomorrow by default, and a meal) and *Clear meal* (`diary.clearMeal`, once confirmed), the result
  of a copy in a toast. Source badges are `SourceBadge` (`components/foods/`). The barcode button
  opens `ScanStep` (`scan-step.tsx`): `BarcodeScanner`, loaded by `next/dynamic`, then
  `food.byBarcode`, opening `FoodStep` on a hit and offering *Search by name*, *Create food* and
  *Scan the label* on a miss, the last two linking to `/foods/new` with the barcode
  (`newFoodHref`), the last starting it with the camera. Those links and the sheet's own *Create
  food* carry the sheet's `date` and `meal`; saving the new food comes back to
  `/diary?date=&meal=&food=` (`addToDiaryHref`), which opens the sheet on `FoodStep` for that food
  and drops `meal` and `food` from the address once the sheet closes.
  Once a day has loaded, `diary.day` and `goals.forDate` of the days either side are prefetched,
  so stepping a day renders from cache with no skeleton; `e2e/day-view.spec.ts` holds that under
  100 ms. `DayTotals` reads `goals.forDate` beside `diary.day`: an energy ring of the kcal left and bars
  for protein, carbohydrate and fat, the ring split by each macro's share of the energy. Energy and
  the macros have colours of their own everywhere, the `--energy`, `--protein`, `--carbohydrate` and
  `--fat` tokens in `app/globals.css` (`components/nutrients/nutrient-colours.ts`, and the trend
  charts), red once `progressOf` says over; every other bar is coloured by `progressOf` (`components/nutrients/progress.tsx`,
  each bar a visually hidden `meter` whose `aria-valuetext` names the share and the state, which is
  what tests read), and links to `/diary/nutrients`, `NutrientPanel`: every nutrient of the `date`,
  or of the `meal` in the address, grouped, with *No data* for a nutrient nothing declared.
- `components/scanner/` — `BarcodeScanner`: the rear camera through `getUserMedia`, read every
  `scanIntervalMs` for EAN-8, EAN-13 and UPC-A, a code reported once it reads the same twice in a
  row; a torch toggle where the track has one; the denied, no-camera and failed states; the stream
  stopped on unmount. `createBarcodeDetector` (`detector.ts`) uses the browser's
  `BarcodeDetector` when it reads all three formats and otherwise imports the `barcode-detector`
  ponyfill, so ZXing stays out of the initial bundle. Its wasm is served from
  `public/zxing/zxing_reader.wasm`, never jsDelivr (the privacy policy promises no third-party
  requests); `detector.test.ts` fails until a `barcode-detector` upgrade copies the new
  `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` there. Component tests fake the camera
  and the detector with `fakeCamera` (`test/camera.ts`).
- `app/(app)/trends/` — `TrendsOverview` (`components/trends/`): range chips (7, 30 or 90 days
  ending today, 30 by default) over `trends.range`, kept on screen while the next range loads. A
  summary (the averages of energy and the macros over the logged days, adherence and the weekly
  rate of the trend weight in the range, and a link to the nutrient report), then, with a logged day in the range, the Energy chart
  (daily kcal bars, the goal as a dashed step line, the rolling average) and the Macros chart
  (protein, carbohydrate and fat stacked, coloured per theme through `ChartConfig`'s `theme`), and
  the Weight section: `WeightTrendFigure` (`components/body/weight-chart.tsx`) over the range and a
  link to `/body`. Each chart is hidden from screen readers behind a `figcaption` that sums it up.
- `app/(app)/foods/` — `UserFoods` (`components/foods/`), the user's foods with a search box,
  each linking to `/foods/[id]` and archived from the list once confirmed (`ArchiveFoodDialog`, shared with the editor), and *New food* to `/foods/new` (`?barcode=` fills the barcode).
  Both pages render `UserFoodForm` through `NewUserFood` and `EditUserFood`: name, brand,
  barcode, pack size, the EU label with salt, the rest of the canon behind *All nutrients*
  (`nutrientNames`), and the portions. Amounts typed per serving are scaled to 100 g and rounded
  to two decimals (`per100gOfEntered`); an edit keeps the stored amount of every nutrient field
  it did not touch. Editing also archives, once confirmed. While label scanning is on, a new food
  offers *Scan a label instead* (`?scan=label` starts with it): `LabelCapture`, loaded by
  `next/dynamic`, whose reading
  fills the form through `labelReadingToFood`, keeping the barcode. Each field the reading is
  unsure of is highlighted (`TextField`'s `warning`), a nutrient with what the label printed,
  until it is edited, under a notice listing the reading's notes.
- `app/(app)/foods/recipes/` — recipes, under the Foods tab: `FoodsNav` (`components/foods/`)
  switches between *Search*, *Your foods* and *Recipes*. `/foods/search` is `FoodBrowser`
  (`components/foods/food-browser.tsx`): `food.search` on the `q` search parameter, or the
  diary's `ScanStep` with no meal, each food
  opening a sheet that adds it to any date and meal through the diary's `AddEntry`
  (`components/diary/food-step.tsx`), the meal defaulting to `mealAtHour` of the time of day. `Recipes` (`components/recipes/`) is
  `recipe.list`, each linking to `/foods/recipes/[id]`. `NewRecipe` takes the name, servings and
  optional cooked weight and opens the new recipe's builder, `RecipeBuilder`: the same fields,
  saved by *Save recipe*, then the ingredients, each saved as it changes. *Add ingredient* opens
  `IngredientSheet`, a bottom sheet with the Foods tab (`food.search`) and the Recipes tab (the
  caller's other recipes, filtered by name), then the amount (`IngredientAmountForm`, also behind
  tapping an ingredient) with a live preview. Each ingredient moves up or down
  (`recipe.reorder`) or is removed. `RecipeNutrition` is the summary per serving and per 100 g,
  `recipeNutrients` over the ingredients and the servings and cooked weight as they are typed.
  The fields are a `<form>` of their own, with the ingredients outside it: React bubbles a submit
  from the sheet's portal to every form around it.
- `app/(site)/` — the privacy policy, terms and cookie policy, prerendered, built from
  `components/legal/legal-document.tsx` (`LegalDocument`, `LegalSection`, `LegalTable`,
  `Callout`, and `lastUpdated`, `supportEmail`, `operator` in one place). A change to what the app
  collects, keeps, sets in the browser or shares with someone changes the privacy or cookie policy
  in the same change and bumps `lastUpdated`. `legalDocuments` in `lib/navigation.ts` is the one
  list the footer (`components/site-footer.tsx`, rendered by the auth and legal layouts and
  onboarding) and `accountLinks` link from.
- `lib/logger.ts` — pino; pretty in development, JSON in production.
- `test/api.tsx` — `serveApi()` serves the real router over MSW on a fresh in-memory database per
  test, with a ticking clock and sequential ids; `serveApi({ signedInAs: 'user-1' })` creates that
  user and calls every procedure as them. `api.wrap(<Component />)` renders with the client
  providers; `api.fails('<procedure>')` makes one procedure answer 500.
- `app/manifest.ts` and `public/icons/` make the app installable. `public/icons/icon.svg` is the
  source; the PNGs are rendered from it. **No service worker**: nothing is cached on the device,
  and `e2e/install.spec.ts` fails if one is registered (ADR 0014). The manifest and the meta
  theme-color carry `lib/brand.ts`'s hex colours; `ThemeColor` (`components/theme-color.tsx`, in
  the root layout) sets every `theme-color` meta to the theme chosen in Settings, so the browser
  bars follow it rather than the system's. iOS ignores the manifest at launch: its splash is an
  `apple-touch-startup-image` per screen of `splashScreens` (`lib/splash.ts`), each prerendered at
  build by `app/splash/[size]/route.tsx` (the icon on the dark background, through `next/og`); a
  new iPhone screen size is a new row there. `InstallBanner` (`components/app-shell/`, ADR 0015)
  tells a phone how to install: Share → Add to Home Screen on iOS, the browser menu's Install app
  on Android (`installPlatform`, `lib/install.ts`), nothing on a desktop, when standalone, or once
  dismissed. Playwright's default storage state dismisses it, so only `e2e/install.spec.ts` sees it.
- `components/ui/` is vendored shadcn (`base-mira`, stone, Tabler icons) and keeps whatever it
  ships. Add a component with `yarn shadcn add <name>`, then point any `cn` import it brings at
  `@/lib/utils`.

## Conventions

- **No comments.** Names carry the meaning — extract a named constant or function instead of
  explaining a line. No JSDoc on types, fields or functions either. The only exception is an
  unexplainable hack (a protocol quirk, an upstream bug the code has to work around), and then the
  comment says *why*, never *what*. Anything a reader needs that is not a hack belongs in a test
  that pins it, an ADR, `docs/` or here — not in `README.md` (see *Docs*).
- **No classes** — factory functions + closures.
- `lib/domain/` is pure TypeScript: no React, no I/O, no framework imports. It is where
  correctness lives, and the only thing coverage is measured on.
- `lib/db/` is the only module that talks to SQLite.
- **One vocabulary.** A name in code, an issue or UI copy is the word `docs/DOMAIN.md` uses for it,
  checked against `docs/GLOSSARY.md`. A new concept is named in DOMAIN first.
- **Ownership is on the statement.** Every read and write of a user's data carries
  `where user_id = ?` for the caller from the context, never a read followed by a check, and the
  user id never comes from input.
- **Behaviour lives in services, not transports** (ADR [0002](docs/adr/0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md)).
  tRPC procedures and `/api/v1` route handlers authenticate, validate with Zod and call the same
  function over the context; a user-facing behaviour exists on both or neither.
- **History is snapshots** (ADR [0003](docs/adr/0003-diary-entries-snapshot-their-nutrients.md)).
  A diary entry keeps the nutrient vector it resolved to; totals are sums over snapshots, never a
  join to `foods`, and never stored.
- A **date** is the user's local day as a `YYYY-MM-DD` string, never a `Date` or a timestamp.
- **No `console`.** Log through pino: `getLogger('<module>')` from `lib/logger.ts`. Biome enforces
  this everywhere except `scripts/`, which are CLIs and print.
- **Four kinds of test, and the extension picks the kind.** All four live next to what they
  cover, except the end-to-end ones.
  - `*.test.ts` — Vitest `unit` project, `environment: 'node'`. Pure logic, and the modules that
    own I/O driven for real against an in-memory database: `migratedDatabasePerTest()` from
    `test/db.ts` gives each test a fresh, migrated one. Coverage is measured on this project alone,
    over `lib/domain/**`, and fails the run under 90% — which is why `yarn test` runs Vitest twice.
  - `*.test.tsx` — Vitest `ui` project, `environment: 'happy-dom'`. React Testing Library and
    `@testing-library/user-event`, through `renderUi` from `test/ui.tsx`, which wraps the app's
    providers and hands back a `user`: everything a user does to a component and everything it
    says back. happy-dom lays nothing out, so `test/dom-setup.ts` gives every element a
    `clientHeight` of 10,000 px for a virtualised list to fill; a test of what scrolls out of view
    spies on it. Query by role, label and text — never by class, inline style or a fragment of
    markup. A component that calls tRPC renders with `renderUi(ui, { wrap: api.wrap })` over
    `serveApi()` from `test/api.tsx`.
  - `*.eval.ts` — Vitest `real-ai` project, `environment: 'node'`, run only by
    `yarn test:real-ai`: measurements against a paid model, which print what they measured and
    may use `console`.
  - `e2e/*.spec.ts` — Playwright, and only for what cannot be simulated: routing, real sessions,
    real mail, the OAuth redirects, the mobile viewport. If a test would pass with a fixture and
    no browser, it belongs in a `*.test.tsx`. Every spec runs in both the `desktop-chrome` and
    `mobile-chrome` (Pixel 7) projects, except `mobile.spec.ts`, the phone journey, which skips
    on desktop. `expectNoSeriousViolations` (`e2e/axe.ts`) runs axe once the page's animations
    settle and fails on any `serious` or `critical` violation. E2e has its own database,
    `.data/e2e.sqlite`, named once in `playwright.config.ts`; `e2e/prepare-database.ts` recreates, migrates and seeds it, and empties
    the mail outbox, in the web server command before the server starts — not in `globalSetup`,
    which Playwright runs after the server has the old file open. It seeds the dev user too, whom
    `signInAsDevUser` (`e2e/auth.ts`) signs in as; a spec that changes an account makes a fresh
    one, since every worker shares the dev user.
- Mobile-first: the app is used one-handed, standing in a kitchen or at a supermarket shelf.
  Metric units and kcal, English only.
- Biome formats and lints; single quotes, 2-space indent. A husky pre-commit hook fixes
  staged files and blocks on any remaining lint error. `scripts/format-on-save.sh` does the
  same for one file and is wired to the Claude Code `PostToolUse` hook in
  `.claude/settings.json`, so every file an agent writes is formatted and import-sorted.
  `.vscode/settings.json` does the same on save in the editor.
- **Conventional Commits** for every commit message (`feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, …), enforced by commitlint with `@commitlint/config-conventional` on a husky
  `commit-msg` hook. The repo squash-merges only, and the **PR title becomes the commit subject**
  and the PR body its message, so a PR title follows the same format.

## Docs

- **`README.md` is a front door, not a manual.** It says what the app is, how to run, test,
  configure and deploy it, and where the other docs are. A change touches it only when one of
  those changes. A feature, a fix or a new screen does not.
- `docs/DOMAIN.md` — the domain vocabulary. Read before touching `lib/domain/`.
- `docs/GLOSSARY.md` — every DOMAIN term in one table. DOMAIN changes first, then the glossary.
- `docs/DATA-SOURCES.md` — each reference source, its licence and attribution. A new source adds
  a section in the same change.
- `docs/adr/` — decisions that are expensive to reverse, with alternatives and a revisit trigger.
  Read [the index](docs/adr/README.md) before changing data flow, persistence, the API, auth or
  deployment, and add a record in the same change when you take a decision of that kind.
- `docs/API.md` — the REST API for API keys: creating a key, a curl for each endpoint, the error
  envelope, pagination and a note for agents. A new or changed route changes it in the same
  change, and the route's `example` with it.
- `docs/DEPLOY.md` — the image, the Docker workflow and `.github/deploy/deploy.sh`, their secrets,
  and the homelab compose entry. The image carries `scripts/backup-database.ts` and the
  `lib/db/` files it imports; a new import there needs a `COPY` in the `Dockerfile`.
- The roadmap, its decisions and its milestones are the pinned GitHub issue #67.
- Per-item scope and *done when* live on the GitHub issue, not in the repo: `gh issue view <n>`.
