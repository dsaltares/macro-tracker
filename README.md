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

The dev server listens on [http://localhost:3014](http://localhost:3014). `.env.example` lists
the environment variables.

The scripts are in `package.json`, and `AGENTS.md` says what each one is for.

## Docs

- [`AGENTS.md`](AGENTS.md): commands, conventions and where things live
- [`docs/DOMAIN.md`](docs/DOMAIN.md): the domain vocabulary, and
  [`docs/GLOSSARY.md`](docs/GLOSSARY.md): its terms in one table
- [`docs/adr/`](docs/adr/README.md): architecture decision records
- The roadmap is the pinned issue [#67](https://github.com/dsaltares/macro-tracker/issues/67)
- Scope and acceptance criteria for a piece of work live on its GitHub issue
