# 0001 — Run as one container, with SQLite on a volume

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #2, #5, #67; Triumph ADRs
  [0006](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0006-self-hosted-single-container.md)
  and
  [0007](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0007-sqlite-on-a-volume.md)

## Context

The app is self-hosted on the homelab and multi-user capable, but its audience is a handful of
people logging meals. Every write is one person's diary, one food or one setting; nothing is
shared between users except reference foods, which only the importer writes.

The data is not small in the way Triumph's was. The reference catalogue is every European Open
Food Facts product with nutrition facts plus the CIQUAL, CoFID and USDA tables: hundreds of
thousands of rows in a wide nutrient table, searched through FTS5 and looked up by barcode. It is
written in bulk by an importer that runs **inside the server process** (#67), in short batched
transactions, while people keep logging.

Triumph already runs this shape on the same homelab, and its ADRs 0006 and 0007 make the case in
full. What carries over unchanged:

- One standalone Next.js image on ghcr.io, one process, a non-root user, persistent state on a
  `/data` volume, deployed from `main` over SSH through Cloudflare Access.
- SQLite through `better-sqlite3`, one file at `DATABASE_URL`, with Kysely for typed queries and
  migrations. No ORM, so moving to Postgres is a dialect change rather than a rewrite.
- One process is one writer, which is what makes SQLite viable.

What is different here:

- The database is part of the product, not a filing cabinet. Search and barcode lookup are
  queries on a hot path, so indexes are chosen against `EXPLAIN QUERY PLAN`, not by hunch.
- The writer is not only requests. The importer shares the connection with them, so WAL, a busy
  timeout and short transactions are load-bearing rather than hygiene.
- The volume holds a dataset that is expensive to rebuild (a full Open Food Facts import), so the
  app ships its own online backup instead of relying on volume snapshots alone.

## Decision

One container, one process, with SQLite on the `/data` volume, exactly as Triumph does.

`lib/db/` is the only module that talks to SQLite. `createDatabase(url)` opens it with WAL,
`foreign_keys` on and a five-second busy timeout; `DATABASE_URL` is resolved in `lib/db/url.ts`
and nowhere else, defaulting to `.data/db.sqlite`. Migrations are an ordered map of static imports
in `lib/db/migrator.ts`, never a directory read, because `output: 'standalone'` traces modules,
not directories. `yarn db:backup` takes an online backup beside the database and keeps ten.

## Alternatives considered

- **Postgres in a second container.** Better concurrency for the importer, and twice the moving
  parts, backups and local setup for a workload one file handles.
- **The importer as a separate process or job.** Removes import writes from the request process,
  and adds a second writer that SQLite serialises anyway, plus a second thing to deploy. The
  roadmap (#67) keeps ingestion in the server process for that reason.
- **A hosted database.** A vendor, a network hop and a bill, and the data leaves the volume the
  homelab already backs up.

## Consequences

- One writer, no horizontal scaling; revisit together with the deployment shape.
- A long import transaction blocks every other write until it commits. Importers must batch and
  yield, and a request that waits longer than the busy timeout fails rather than hangs.
- `better-sqlite3` is a native module: installs run build scripts (`enableScripts` in
  `.yarnrc.yml`) and the image's dependency stage needs a toolchain.
- Queries are synchronous. Fine at this scale, and a hazard for anything long-running on a request
  path.
- Tests get a real database cheaply: `:memory:` or a temporary file, migrated per test.
- `docker compose down -v` destroys the database and its backups together; off-host copies are the
  homelab's job.

## Revisit trigger

Busy timeouts in production while an import runs, a need for a second app process, or the
database file outgrowing what a volume snapshot and ten local backups handle comfortably.
