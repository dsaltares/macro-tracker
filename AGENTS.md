# AGENTS

Food macro and micronutrient tracker, a mobile-first installable PWA, self-hosted.
TS (strict), Yarn 4, Node 24, Next.js 16 App Router, React 19.

## Commands

- `yarn dev` — dev server on 3014 · `yarn build` · `yarn start`
- `yarn typecheck` · `yarn lint` · `yarn format`
- `yarn test` — the `unit` project under coverage, then the `ui` project · `yarn test:watch` runs
  both. `vitest run --project ui <path>` narrows to one file.
- `yarn test:e2e` — Playwright against a production build of its own (`next build` then
  `next start`, in `.next-e2e` on 3015), never a server already running; `E2E_PORT` moves it when
  another worktree holds 3015. `yarn test:e2e:dev` runs it against `next dev` instead, for hot
  reload while writing a spec. First time on a machine: `yarn playwright install chromium`.
- `yarn db:migrate` — apply outstanding migrations to `DATABASE_URL` · `yarn db:migrate down`
  rolls one back
- `yarn db:backup` — copy the database with SQLite's online backup into `backups/` beside it
  (`BACKUP_DIR` overrides), keeping the last ten

## Modules

- `lib/brand.ts` — the app's name, short name, description and background colours. Every place
  that names the app or paints its background reads them from here.
- `lib/db/` — SQLite through Kysely (ADR [0001](docs/adr/0001-one-container-sqlite-on-a-volume.md)).
  `createDatabase(url)` opens a connection with WAL, foreign keys and a busy timeout;
  `DATABASE_URL` is read in `url.ts` and nowhere else. The typed `Database` is in `schema.ts`.
  Migrations are an ordered map of static imports in `migrator.ts`, never a directory read —
  `output: 'standalone'` traces modules, not directories. Add a migration, never edit one that has
  shipped. An index needs a plan, not a hunch: `query-plans.test.ts` runs `EXPLAIN QUERY PLAN`
  over the real statements and asserts no `SCAN` on the tables each names.
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
    markup. MSW is installed for faking the API once there is one.
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
- The roadmap, its decisions and its milestones are the pinned GitHub issue #67.
- Per-item scope and *done when* live on the GitHub issue, not in the repo: `gh issue view <n>`.
