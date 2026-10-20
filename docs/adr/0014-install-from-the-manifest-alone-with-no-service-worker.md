# 0014 — Install from the manifest alone, with no service worker

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #63, #64, #66, Triumph
  [0024](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0024-install-by-instruction-not-beforeinstallprompt.md)

## Context

#63 planned a Serwist worker: a precached shell, network-first pages and tRPC, an offline fallback
page and an update toast. Triumph's ADR 0024 already settled that installability needs a manifest
over HTTPS and nothing else. Chrome dropped the worker requirement, and Safari never had one.

What a worker would buy here is small. Offline writes were never in scope, so offline the diary
could only show a fallback page saying it is offline, which the browser already does on its own.
What it would cost is large. A precached shell outlives the deploy that replaced it, and needs an
update flow to get rid of it. A cached tRPC response is a diary that disagrees with the server. A
cached page can outlive the session it was rendered for. Every one of those is a bug that only
shows up on a phone that has been installed for a while, which is the hardest place to debug it.

## Decision

`app/manifest.ts` is the whole of installability, as in Triumph. There is no service worker, no
Serwist, no offline fallback page and no update toast. Every request goes to the network, and a
deploy is live on the next navigation.

The manifest's `start_url` is `/diary`, not `/`. A launch from the home screen lands on the diary
and does not spend its first paint on the redirect. `id` stays `/`, so an install made before this
change is still the same app.

The three security headers Triumph sends with its manifest come too. They are in `next.config.ts`,
on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and
`Referrer-Policy: strict-origin-when-cross-origin`.

How the app asks to be installed is #64's job. Following Triumph, it prompts by instruction and
not through `beforeinstallprompt`.

## Alternatives considered

- **Serwist, as #63 planned.** A worker that caches the shell and the API, plus an update flow to
  undo that caching after every deploy. Its only offline feature is a page that says the app is
  offline.
- **A worker that only serves the offline fallback page.** No stale-cache bugs, but a worker still
  has to be registered, updated and unregistered across deploys, all for a page that says the
  browser has no connection.
- **A pass-through worker, to be safe about installability.** No browser needs one, and it would
  give a later change somewhere to start caching without a decision.

## Consequences

Offline, the installed app shows the browser's own offline page. Each launch fetches the shell
from the server, which #66's performance pass has to win back with plain HTTP caching of
`/_next/static/`, which Next already makes immutable. It cannot use a worker cache for that.

`e2e/install.spec.ts` reads the manifest and asserts that no worker is registered, so a dependency
that brings one in fails the suite.

Nothing here may be embedded in an iframe.

## Revisit trigger

A browser we support stops offering the install without a worker. Or offline logging becomes a
feature, which needs a write queue and a decision of its own, not just a worker.
