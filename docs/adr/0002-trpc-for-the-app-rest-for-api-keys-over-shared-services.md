# 0002 — Serve the app over tRPC and API keys over REST, both through shared services

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** #7, #27, #57, #58, #62, #67, [`docs/DOMAIN.md`](../DOMAIN.md) § API

## Context

The app has two kinds of client, and they want different things from an API.

- **The app itself.** One codebase, deployed as one image, so client and server always ship
  together. It wants end-to-end types, TanStack Query caching and invalidation, and the freedom to
  reshape a procedure whenever a screen changes. Nobody else depends on its shape.
- **API clients.** Scripts, shortcuts and agents that log a meal or pull a day's totals with a
  bearer **API key** (#57). They are written in whatever language their author likes, and they
  break when a field is renamed. They want plain HTTP and JSON, a published contract, and
  stability.

What must not happen is a behaviour that works one way in the app and another through the API —
ownership checked in one and not the other, a snapshot taken by one and not the other. The
roadmap (#67) states the rule: a behaviour exists in both or neither, and both behave the same.

tRPC 11 is already wired (#7): `createContext` hands every procedure its database, `now()`,
`nextId()` and `caller`, and tests drive the real router against an in-memory database.

## Decision

Two transports over one layer of services.

- **tRPC** at `/api/trpc` is the app's only API. It authenticates with the session. Its procedures
  are free to change shape with the UI, and nothing outside this repository may call them.
- **REST** under `/api/v1` is the API-key surface (#58): Next.js route handlers wrapped in
  `apiHandler`, which parses the bearer key, checks it is live and carries the scope the route
  needs (`read` or `write`), and answers errors in one envelope. It is versioned by its path, and a
  breaking change is a `/api/v2`, not an edit.
- **Services** in `lib/services/` hold the behaviour. A service is a plain function over the same
  context the tRPC procedures get — database, clock, id source, caller — and a Zod-validated input.
  It scopes every statement by its caller and knows nothing about HTTP, sessions or keys. A
  procedure and a route handler are adapters: authenticate, validate, call the service, map its
  result or error to their transport.
- **The OpenAPI document is generated** from the Zod schemas the REST routes register, with Zod 4's
  `toJSONSchema`, and served at `/api/v1/openapi.json` (#62). It is never written by hand, and a
  route without a spec entry fails a test.

Until #58 there is only one transport, and a procedure may hold its logic inline. #58 extracts
whatever a REST route needs into `lib/services/` and updates this record with the shape that
results.

## Alternatives considered

- **Expose the tRPC procedures as REST** (`trpc-to-openapi` and its forks). One definition, two
  surfaces, but the public contract becomes whatever the app's procedures happen to be today, so
  every UI refactor is a breaking API change. The generator is also a third-party layer between
  tRPC and Zod majors, and its predecessor was abandoned.
- **REST for both.** One surface and one contract, and the app loses inferred types, procedure
  batching and TanStack Query integration, which is most of what makes the client cheap to write.
- **tRPC for both.** No second surface to maintain, and API clients get a protocol with no
  published contract, awkward from `curl` and from anything that is not TypeScript.
- **GraphQL.** Flexible reads for clients we do not have, and a schema, resolvers and a client
  cache to carry for a handful of users.

## Consequences

- A public behaviour costs a service, a procedure and a route. The procedure and the route are thin
  enough to be tested for wiring, and the service is where the behaviour is tested once.
- Authorization lives in two places by design: which **caller** a request is, decided by its
  transport (session or key), and what that caller may touch, decided by the service's
  `where user_id = ?`. A service never takes a user id from its input.
- The app's API can change in any pull request; `/api/v1` cannot. Renaming a field the REST surface
  returns needs a new version, so its responses are mapped from service results, never passed
  through.
- API-key concerns — scope, revocation, `last_used_at`, the error envelope, pagination — sit in
  `lib/api/` and never leak into services or the tRPC router.
- Rate limits are not built (#67), and both transports are where they would go.

## Revisit trigger

A behaviour that has to exist on one surface and not the other, a third transport (the MCP server
in the backlog), or `/api/v1` needing a breaking change.
