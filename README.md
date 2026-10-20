# macro-tracker

Log what you eat and track calories, macros and micronutrients against goals that follow your
body. A mobile-first installable web app, self-hosted.

Next.js 16 (App Router), React 19 and TypeScript.

## Development

Requires Node 24 (see `.nvmrc`) and Corepack for the pinned Yarn version.

```sh
corepack enable
yarn install
yarn dev
```

The dev server listens on [http://localhost:3014](http://localhost:3014), with a confirmed
`dev@example.test` (password `macro-tracker-dev`) and a few hundred foods seeded. `.env.example`
lists the environment variables.

The scripts are in `package.json`, and `AGENTS.md` says what each one is for.

## Deployment

```sh
docker compose up --build
```

runs the production image on `127.0.0.1:3014` with SQLite on the `/data` volume. A push to `main`
publishes `ghcr.io/dsaltares/macro-tracker` and deploys it to the homelab;
[`docs/DEPLOY.md`](docs/DEPLOY.md) has the pipeline, its secrets and the homelab entry.

## Docs

- [`AGENTS.md`](AGENTS.md): commands, conventions and where things live
- [`docs/DOMAIN.md`](docs/DOMAIN.md): the domain vocabulary, and
  [`docs/GLOSSARY.md`](docs/GLOSSARY.md): its terms in one table
- [`docs/adr/`](docs/adr/README.md): architecture decision records
- [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md): the food datasets, their licences and attribution
- [`docs/DEPLOY.md`](docs/DEPLOY.md): the image, the deploy pipeline and the homelab entry
- The roadmap is the pinned issue [#67](https://github.com/dsaltares/macro-tracker/issues/67)
- Scope and acceptance criteria for a piece of work live on its GitHub issue
