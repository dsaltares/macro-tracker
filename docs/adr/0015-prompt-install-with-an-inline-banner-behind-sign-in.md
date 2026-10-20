# 0015 — Prompt the install with an inline banner in the signed-in app

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #64, [0014](0014-install-from-the-manifest-alone-with-no-service-worker.md), Triumph
  [0024](https://github.com/dsaltares/triumph-army-builder/blob/main/docs/adr/0024-install-by-instruction-not-beforeinstallprompt.md)

## Context

Triumph's ADR 0024 settled that the app asks to be installed by instruction, naming the
platform's own menu item, and never through `beforeinstallprompt`. That holds here unchanged.
What differs is where and when the ask appears.

Triumph shows a bottom drawer on the second visit, or after the first saved list, because its
pages are public and a first visit may be someone who has not yet seen what the app does. Its
first attempt, a banner above the footer, sat below the fold and went unseen.

Here every page that could ask is behind sign-in and onboarding. Whoever reaches the app shell
has an account, a profile and goals: they have already decided the app is worth their time.

## Decision

`InstallBanner` (`components/app-shell/`) is rendered by the `app/(app)/` layout after the page,
`sticky` just above the bottom navigation (above the bottom edge from `md`). It stays in view on
every page, takes its own space at the end of the page so it never covers the last thing on it,
and is not modal. It shows on the first page of the app shell, on iOS and Android only, never
when `(display-mode: standalone)` matches, and never again once dismissed, which is remembered in
local storage under `install-banner-dismissed`.

There is no visit counting and no event from a feature, so nothing outside the banner knows it
exists.

## Alternatives considered

- **Triumph's drawer on the second visit.** A modal one-shot that needs a visit counter in
  storage and a delay for hydration. A modal asks for a reflexive answer; an inline banner can be
  ignored while the user logs a meal, then answered later.
- **A banner at the top of the page.** It would push the diary down on every page until
  dismissed, and the top bar extends under the status bar, which a banner above it would break.
- **A banner at the end of the page, not sticky.** Triumph's first attempt: below the fold on
  any page longer than a screen.

## Consequences

The banner overlaps nothing, but it does take about a fifth of a phone's screen until it is
dismissed or the app is installed. The e2e storage state marks it dismissed, so the
`mobile-chrome` project's specs never meet it; `e2e/install.spec.ts` clears that to test it.

The cookie policy lists the new local-storage key.

## Revisit trigger

Triumph's revisit trigger, a standard cross-browser install API. Also: any part of the app
outside sign-in starts to matter on a phone, where the banner would then need Triumph's timing.
