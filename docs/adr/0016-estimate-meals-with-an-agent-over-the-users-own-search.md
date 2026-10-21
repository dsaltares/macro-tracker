# 0016 — Estimate meals with an agent over the user's own food search

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #140, #141, [ADR 0003](0003-diary-entries-snapshot-their-nutrients.md), [ADR 0013](0013-read-labels-through-a-provider-agnostic-ai-seam-and-discard-the-photo.md), [`docs/DOMAIN.md`](../DOMAIN.md) § Diary

## Context

Logging a home-cooked plate or a restaurant meal food by food is the slowest thing the app asks
of anyone. A vision model can name what is on a plate and guess how much of it there is, but its
nutrition numbers are its own: unchecked, inconsistent from one run to the next, and blind to the
user's own foods and recipes, which are what they eat most and what they have already weighed.

The label reader (ADR 0013) is one structured call over one photo. An estimate needs the model
to look things up while it answers, and the user to correct it, since a photo cannot show the oil
in the pan.

## Decision

`createMealEstimator({ model })` (`lib/ai/meal-estimator.ts`) runs a tool loop through the same
seam ADR 0013 set up: `generateText` with `Output.object` of `mealEstimateSchema`, capped at
`maxEstimatorSteps` (10), and two tools over a port, `MealEstimatorFoods`. `searchFoods` is the
search `food.search` runs, as the caller, plus the caller's live recipes matching every word;
`getFood` is one food's portions. `lib/db/meal-estimator-foods.ts` implements the port over the
caller's `FoodReader` and `listRecipes`, so ownership stays on each statement and the model can
only see what the user could find themselves.

The model names foods, recipes and grams; `mealDraft` (`lib/domain/diary/meal-estimate.ts`)
resolves them through `resolveEntry`, so every nutrient of a found food is the database's and
the arithmetic is pure, tested code. The prompt ranks what an item can be: the user's own
food or recipe, then a nutrition label in a photo (a guess with the label's numbers), then a
search result for the same product or ingredient, then the dish split into its ingredients, each
searched. A guess, the model's own energy and macros, is the answer only when none of those fits,
and is flagged to the user like any unsure item.

An estimate that names a food or recipe id the port's `resolveMatches` cannot find, one the model
made up or mistyped, gets one repair round: the conversation so far and the lines that did not
resolve go back to the model, capped at `maxRepairSteps` (5), and its answer is the estimate. A
line still unresolved after it is drafted as an unresolved guess for the user to replace.

Nothing is written until the user reviews the draft. A correction is a new run with
`previous: { draft, feedback }`: the draft as the user left it, sent as the model's earlier
answer, and what they said, with the instruction to keep every line the feedback does not
mention. The photos are held in memory for the request and discarded, as ADR 0013 does with a
label, so a correction sends them again. Each tool call is logged at debug level with its query,
never a photo.

## Alternatives considered

- **One structured call that answers nutrients.** Simpler and one round trip, but every number
  would be the model's, and none of the user's own foods or recipes would ever be chosen.
- **Hand the model the whole food table or the user's foods up front.** Hundreds of thousands of
  reference foods do not fit a prompt; the user's foods alone would leave out every generic one.
- **Keep the photos for the correction round.** Saves an upload, but breaks the policy's promise
  that no photo is stored, for a convenience.
- **Let the model write the entries.** Nothing a model answers reaches the diary without review.

## Consequences

- OpenAI sees, besides the photos and the description, the names and summaries of the user's
  foods and recipes that match its searches, and the draft on a correction. The privacy policy
  names all of it.
- A run costs up to ten model calls, fifteen with a repair round; the step caps bound it, and a
  run that reaches one is `unreadable`, not a partial estimate.
- Tests drive the loop with `MockLanguageModelV4`, the port over a real in-memory database.

## Revisit trigger

Estimates routinely hit the step cap, users correct most drafts more than once, a provider
offers a cheaper hosted retrieval the user's own foods could go through, or the policy has to
promise that no food of the user's leaves the server.
