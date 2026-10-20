# AGENTS

Food macro and micronutrient tracker, a mobile-first installable PWA, self-hosted.
TS (strict), Yarn 4, Node 24, Next.js 16 App Router, React 19.

## Commands

- `yarn dev` — `yarn db:seed`, then the dev server on 3014 · `yarn build` · `yarn start`
- `yarn typecheck` · `yarn lint` · `yarn format`
- `yarn test` — the `unit` project under coverage, then the `ui` project · `yarn test:watch` runs
  both. `vitest run --project ui <path>` narrows to one file.
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
  goal's own, then the overrides. Coverage on it is gated at 100%.
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
- `lib/data/background-import.ts` — `serverFoodImport(db)` starts a run that outlives the request
  with the server's clock, logger and work directory: the one code path behind the endpoint and the
  schedule. `lib/data/seed-foods.ts` imports the fixture into a database with no reference foods,
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
  `createDatabase(url)` opens a connection with WAL, foreign keys and a busy timeout;
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
- `lib/db/food-search.ts` — the food reads behind `food.search`, `food.get` and `food.byBarcode`,
  over a `FoodReader` (`db` and the caller's `userId`, `null` when nobody is signed in). Search is
  FTS5 `MATCH` built by `matchExpression` (`lib/domain/foods/search.ts`), ranked by
  `bm25` with the name and original name weighted over the brand, the caller's own foods first, offset-paged 30 at a
  time. A user food is visible only through `owner_user_id` on the statement; user portions only
  through `user_id`. `food-source-preferences.ts` lists the reference sources with their live
  food counts and saves a user's generic source preferences; search drops a disabled source in a
  subquery on the same statement.
  `food-portions.ts` adds and removes a user's portions: an add reads the food through the same
  visibility as `food.get` and refuses a label the food already shows that user; a remove deletes
  only on `source = 'user'` and the caller's `user_id`. `food.get` returns stored portions with
  their `id` and `source`, the standard ones without.
- `lib/db/diary.ts` — diary entries and favourites (ADR [0003](docs/adr/0003-diary-entries-snapshot-their-nutrients.md)).
  `diary_entries` keeps each entry's snapshot as a JSON object in `nutrients`, and its checks
  enforce the shape of each kind: only a food entry links a food, only a recipe entry a recipe,
  and only a quick entry has no quantity, portion or grams. Deleting a food clears `food_id` and
  keeps the entry; `recipe_id` has no foreign key until recipes have a table. `diaryDay` reads a
  user's date on `(user_id, date)` and orders it by meal, then logging time. `logFood` reads the
  food through the same visibility as `food.get` and resolves the portion by label among the ones
  it shows the caller. `updateDiaryEntry` re-resolves the snapshot from the current food only on
  a quantity or portion change, keeping the logged weight of a portion the food no longer has;
  a move keeps it. `copyDiaryMeal` copies snapshots as they are. The `diary` router
  (`lib/trpc/routers/diary.ts`) is these over the caller. Adding a favourite
  reads the food through the same visibility as `food.get`; `toggleFavourite` removes it or adds
  it in one transaction, `food.toggleFavourite` over the caller. `recentFoods` (`diary.recentFoods`),
  `frequentFoods` (`diary.frequentFoods`, the 90 days up to a date) and `favouriteFoods`
  (`food.favourites`) group the caller's food entries by food, the last logged amount coming from
  SQLite's bare columns beside a lone `max(created_at)`, and hand them to `withLastLoggedAmounts`
  (`food-search.ts`), which reads the summaries search shows and falls back to one default portion.
  Meals and entry kinds are in `lib/domain/diary/entries.ts`.
- `lib/db/body-measurements.ts` — the weight log: one row per user, metric and date (unique on
  `(user_id, metric, date)`, which also serves every read). `logMeasurement` upserts the day,
  keeping its id and `created_at`; `listMeasurements` reads an optional inclusive range, newest
  first; `findLatestMeasurement` is the latest on or before an optional date, the read ADR 0011
  needs. The `body` router (`lib/trpc/routers/body.ts`) is these over the caller. Metrics and the
  weight bounds (20 to 400 kg) are in `lib/domain/body/measurements.ts`; `body/trend.ts` is the
  trend weight (`weightTrend`, α = 0.1 a day, carried flat over days without a weight),
  `weeklyRate` and the chart's `trendRanges`. Coverage on `lib/domain/body/` is gated at 100%. The
  day view shows `LogWeightCard` (`components/body/`) on today until today has a weight; `/body`,
  linked from Trends, is `WeightLog`, with `WeightChart` above the log: the weights and the trend
  weight in Recharts (through shadcn's `components/ui/chart.tsx`) over 30 days, 90 days, a year or
  all, hidden from screen readers behind a `figcaption` that sums it up.
- `lib/db/goals.ts` — the goal settings, one row per user in `goals` with the overrides as a JSON
  object, keeping no history; without a row they are `defaultGoalSettings`. `findGoalOn` reads the
  profile, the latest weight on or before the date and the settings, and hands them to `goalOn`.
  The `goals` router (`get`, `set`, `forDate`) is these over the caller.
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
  macros, the rest of the EU label behind *More nutrients*) and the four meals. Tapping an entry
  opens `EditEntryDialog`, which sends `diary.update` only the fields that changed, since a
  quantity or portion re-resolves the snapshot, or deletes it. A meal's add button opens
  `FoodSearchSheet`, a bottom sheet for that meal: a search box `food.search` follows once typing
  pauses (`searchDebounceMs`), paged by `useInfiniteQuery` as the end of the list scrolls into
  view, and the Recent, Frequent, Favourites and All tabs, typing moving to All. The first three
  are `food-lists.tsx`: each row's add button logs the food's last logged amount to the sheet's
  date and meal in one tap. Choosing a food opens `FoodStep` in the same sheet, whose star toggles
  the favourite. Source badges are `SourceBadge` (`components/foods/`).
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
  source; the PNGs are rendered from it.
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
- **Three kinds of test, and the extension picks the kind.** All three live next to what they
  cover, except the end-to-end ones.
  - `*.test.ts` — Vitest `unit` project, `environment: 'node'`. Pure logic, and the modules that
    own I/O driven for real against an in-memory database: `migratedDatabasePerTest()` from
    `test/db.ts` gives each test a fresh, migrated one. Coverage is measured on this project alone,
    over `lib/domain/**`, and fails the run under 90% — which is why `yarn test` runs Vitest twice.
  - `*.test.tsx` — Vitest `ui` project, `environment: 'happy-dom'`. React Testing Library and
    `@testing-library/user-event`, through `renderUi` from `test/ui.tsx`, which wraps the app's
    providers and hands back a `user`: everything a user does to a component and everything it
    says back. Query by role, label and text — never by class, inline style or a fragment of
    markup. A component that calls tRPC renders with `renderUi(ui, { wrap: api.wrap })` over
    `serveApi()` from `test/api.tsx`.
  - `e2e/*.spec.ts` — Playwright, and only for what cannot be simulated: routing, real sessions,
    real mail, the OAuth redirects, the mobile viewport. If a test would pass with a fixture and
    no browser, it belongs in a `*.test.tsx`. Every spec runs in both the `desktop-chrome` and
    `mobile-chrome` (Pixel 7) projects. E2e has its own database, `.data/e2e.sqlite`, named once
    in `playwright.config.ts`; `e2e/prepare-database.ts` recreates, migrates and seeds it, and empties
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
- `docs/DEPLOY.md` — the image, the Docker workflow and `.github/deploy/deploy.sh`, their secrets,
  and the homelab compose entry. The image carries `scripts/backup-database.ts` and the
  `lib/db/` files it imports; a new import there needs a `COPY` in the `Dockerfile`.
- The roadmap, its decisions and its milestones are the pinned GitHub issue #67.
- Per-item scope and *done when* live on the GitHub issue, not in the repo: `gh issue view <n>`.
