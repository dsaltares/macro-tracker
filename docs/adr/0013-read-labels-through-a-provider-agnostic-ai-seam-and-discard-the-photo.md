# 0013 — Read labels through a provider-agnostic AI seam, and discard the photo

- **Status:** Accepted
- **Date:** 2026-10-20
- **Related:** #44, #45, #46, #47, #93, [ADR 0007](0007-mail-through-resend-behind-a-send-email-seam.md), [`docs/DOMAIN.md`](../DOMAIN.md) § Foods

## Context

A product the barcode lookup misses has to be typed in from its label, which is slow standing at a
shelf. A vision model can read the nutrition table from a photo. The model is the part of this
that changes fastest: providers, models and prices move every few months, and the evals of #45
are how we will know whether a new one reads labels better.

The photo is of a product, not of a person, but it is taken by a signed-in user in their kitchen
or a shop, and the privacy policy promises that the app stores no photos. Every third party that
sees anything is named in the policy before it does.

## Decision

`lib/ai/` is the only module that imports the Vercel AI SDK. `createLabelReader({ model })` takes
any `LanguageModel` and returns `readLabel(image)`, which sends the bytes with the prompt of
`prompts/label.ts` and the JSON schema of `LabelReading` (`lib/domain/foods/label-reading.ts`),
and validates the answer with that same Zod schema. Like `sendEmail`, it never throws: it resolves
to the reading, or to a failure (`unreadable`, `rejected`, `rate-limited`, `unavailable`) with a
message, so no SDK error, whose request body holds the photo, reaches a caller or a log.

The model is resolved from `AI_PROVIDER` (`openai`, the only one for now), `AI_MODEL` (the
provider's default when empty) and `AI_API_KEY`; without a key there is no reader and label
scanning is off. A new provider is one `@ai-sdk/*` package and one line in `providerModels`.

The schema sent to the model drops `minLength` and `maxLength`, which OpenAI's strict structured
outputs refuse; the Zod schema still enforces them on the answer.

The photo is held in memory for the length of the request and never written to disk, the database
or a log. The model transcribes; `labelReadingToFood` does every conversion (kJ, salt, units, per
serving to per 100 g) in pure, tested code, so a model never does arithmetic we cannot check.

## Alternatives considered

- **Call the OpenAI SDK directly.** Ties every caller and test to one provider; switching after an
  eval means rewriting the reader, not changing an environment variable.
- **Run a local OCR or vision model in the container.** A homelab box has no GPU, and OCR alone
  does not know which number is sugars in a table it cannot parse in eight languages.
- **Keep the photos to build the eval set.** The eval photos of #45 are supplied by hand; keeping
  users' photos would break the policy's promise for a convenience.
- **Let the model return canonical per 100 g values.** Easier prompt, but its conversions would be
  unchecked, and the review screen (#47) could not show what was printed.

## Consequences

- OpenAI is a recipient in the privacy policy: it sees the label photo when a user scans one, and
  may keep it up to 30 days for abuse monitoring under its API terms. Switching provider means
  changing the policy in the same change.
- Tests drive the reader with the SDK's `MockLanguageModelV4`; nothing in CI calls a provider.
- A reading the schema rejects (no nutrient values, a unit that does not fit its nutrient) is a
  failure to read, not a partial food.

## Revisit trigger

The evals of #45 score another provider or a local model higher on the EU mandatory fields, the
provider's API terms start keeping or training on inputs, or a second AI feature needs something
other than a one-shot structured reading.
