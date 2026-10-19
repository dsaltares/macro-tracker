# AGENTS

Food macro and micronutrient tracker, a mobile-first installable PWA, self-hosted.
TS (strict), Yarn 4, Node 24, Next.js 16 App Router, React 19.

## Commands

- `yarn dev` — `yarn db:seed:foods`, then the dev server on 3014 · `yarn build` · `yarn start`
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
  named, or the fixture alone. Refused while another import is running
- `yarn db:seed:foods` — migrate `DATABASE_URL` and import the fixture into it when it has no
  reference foods, so a fresh clone has something to search. Does nothing otherwise
- `yarn db:backup` — copy the database with SQLite's online backup into `backups/` beside it
  (`BACKUP_DIR` overrides), keeping the last ten
- `yarn data:sample` — rebuild `test/fixtures/off/sample.csv`, the trimmed Open Food Facts export
  the adapter's test reads, from `test/fixtures/foods/sample.jsonl`. Run it after changing either
  that fixture or `test/fixtures/off/export-header.tsv`; a test fails until you do
- `yarn data:off` — stream the real Open Food Facts export through the adapter without writing
  anything, and print what it kept, the bytes, wall time and peak memory. An optional URL argument
  reads another export
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
- `lib/data/import-foods.ts` — the importer. `importFoods({ db, sources, clock, logger, signal,
  workDir })` streams each `FoodSource` into `upsertFoods` in batches of 2,000, one transaction
  per batch and a yield to the event loop between them, then archives the foods of the sources
  that adapter `emits` that the run did not see. It takes no request context. A run is a row in
  `food_imports` (`lib/db/food-imports.ts`), kept current after every batch; a partial unique
  index allows one `running` row, which is the lock, and a second run is answered with it.
  `instrumentation.ts` fails a row still `running` at boot as `interrupted`. "Seen" is an
  `updated_at` at or after the run's start: every upsert writes it. `launchFoodImport` answers
  once the row exists, with a `finished` promise; `importFoods` awaits it. The adapters the CLI,
  the endpoint and the schedule can name are in `lib/data/sources/registry.ts` (`chooseSources`).
- `lib/data/background-import.ts` — `serverFoodImport(db)` starts a run that outlives the request
  with the server's clock, logger and work directory: the one code path behind the endpoint and the
  schedule. `lib/data/seed-foods.ts` imports the fixture into a database with no reference foods,
  for `yarn db:seed:foods` and `e2e/global-setup.ts`.
- `lib/data/food-import-schedule.ts` — the in-process schedule (`croner`). `FOOD_IMPORT_CRON` is
  the pattern; unset means the first Sunday of the month at 03:00 server time, empty means off,
  and it is always off under Vitest. The e2e server and the `.env` `yarn db:copy-down` writes set
  it empty.
- `lib/internal-api/` — `POST /api/internal/imports/foods` (`{ sources? }`, every registered
  adapter when absent) answers `202` with the new `food_imports` row, or `409` with the running one;
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
  is one. `foods_fts` is external-content FTS5 over `name` and `brand`, kept in step by triggers.
- `instrumentation.ts` — migrates the database to the latest version when the server boots, so
  the container needs nothing run before it, fails imports a restart interrupted, and starts the
  food import schedule. Anything else that must start with the server goes
  here too.
- `lib/trpc/` — tRPC 11 over the fetch adapter at `app/api/trpc/[trpc]`. `createContext` hands
  every procedure its database, `now()`, `nextId()` and `caller` (always `null` until accounts
  land), so tests swap any of them. Procedures live in `routers/`, mounted in `root.ts`. Components
  call them through `useTRPC()` and TanStack Query; `TRPCReactProvider` sits in the root layout.
- `lib/logger.ts` — pino; pretty in development, JSON in production.
- `test/api.tsx` — `serveApi()` serves the real router over MSW on a fresh in-memory database per
  test, with a ticking clock and sequential ids. `api.wrap(<Component />)` renders with the client
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
    in `playwright.config.ts`; `e2e/global-setup.ts` recreates and migrates it before each run.
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
- `docs/adr/` — decisions that are expensive to reverse, with alternatives and a revisit trigger.
  Read [the index](docs/adr/README.md) before changing data flow, persistence, the API, auth or
  deployment, and add a record in the same change when you take a decision of that kind.
- `docs/DEPLOY.md` — the image, the Docker workflow and `.github/deploy/deploy.sh`, their secrets,
  and the homelab compose entry. The image carries `scripts/backup-database.ts` and the
  `lib/db/` files it imports; a new import there needs a `COPY` in the `Dockerfile`.
- The roadmap, its decisions and its milestones are the pinned GitHub issue #67.
- Per-item scope and *done when* live on the GitHub issue, not in the repo: `gh issue view <n>`.
