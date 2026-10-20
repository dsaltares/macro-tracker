# Glossary

Every term [`DOMAIN.md`](DOMAIN.md) defines, in one table, so a name in code, an issue or a UI
string can be checked in one place. DOMAIN is the source of truth: a term is added there first and
then here. Use these words as they are; do not vary them in code or UI copy.

| Term | Meaning | See |
|---|---|---|
| account | A user with a confirmed address. Only an account has a session and owns data. | [Accounts](DOMAIN.md#accounts), [ADR 0006](adr/0006-sessions-only-for-a-confirmed-address.md) |
| account deletion | Removing a user and everything they own in one statement, confirmed by typing the address, then signing out. Also how consent is withdrawn. | [Accounts](DOMAIN.md#accounts), [ADR 0010](adr/0010-delete-an-account-in-one-statement-that-cascades-through-the-schema.md) |
| activity level | Sedentary, light, moderate, active or very active, each a TDEE multiplier from 1.2 to 1.9. | [Body and goals](DOMAIN.md#body-and-goals) |
| age band | The EFSA adult age group a dietary reference value applies to: 18–24, 25–50, 51–70 or 71+. An account of 16 or 17 is in the youngest. | [Body and goals](DOMAIN.md#body-and-goals) |
| API client | Anything that calls the REST API under `/api/v1` with an API key, never a session. | [API](DOMAIN.md#api), [ADR 0002](adr/0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md) |
| API key | A user's named bearer credential, scoped `read` or `write`, stored hashed, shown once, revocable. A user may have several. | [API](DOMAIN.md#api) |
| app | The installable PWA, which talks tRPC with a session. | [API](DOMAIN.md#api), [ADR 0002](adr/0002-trpc-for-the-app-rest-for-api-keys-over-shared-services.md) |
| archived | A reference food that a later full import no longer saw: hidden from search, still resolvable from the diary. Never deleted. | [Foods](DOMAIN.md#foods) |
| barcode | An EAN-8 or EAN-13; a UPC-A is normalised to EAN-13 with a leading zero. | [Foods](DOMAIN.md#foods) |
| BMR | Basal metabolic rate: Mifflin-St Jeor over the profile, the latest weight and the age on the date. | [Body and goals](DOMAIN.md#body-and-goals) |
| body measurement | A user, a date, a metric and a value. Only `weight_kg` in v1. | [Body and goals](DOMAIN.md#body-and-goals) |
| consent | Agreeing to the terms and acknowledging the privacy policy at sign-up, stored as `terms_accepted_at`. Required for an account, because the diary is health data. | [Accounts](DOMAIN.md#accounts), [ADR 0009](adr/0009-process-the-diary-on-explicit-consent-recorded-at-sign-up.md) |
| confirmed address | An email address whose owner followed the link mailed to it. Required before a session. | [Accounts](DOMAIN.md#accounts) |
| cooked weight | A recipe's optional weight in grams once cooked. | [Recipes](DOMAIN.md#recipes) |
| date | The user's local calendar day as `YYYY-MM-DD`. Never a timestamp. | [Diary](DOMAIN.md#diary) |
| day totals | The sum of a day's entry snapshots. Computed, never stored. | [Diary](DOMAIN.md#diary) |
| default portion | A food's first own portion, or `100 g` when it has none. What search shows beside a food. | [Foods](DOMAIN.md#foods) |
| delta | A source adapter that reads only what changed upstream since its last succeeded run. Upserts, never archives. | [Foods](DOMAIN.md#foods) |
| derived goal | A goal computed from a weekly rate target at 7,700 kcal per kg, protein in g per kg, a fat share of energy, carbohydrate as the remainder and fibre at 14 g per 1,000 kcal. | [Body and goals](DOMAIN.md#body-and-goals) |
| diary entry | One logged item: a user, a date, a meal, an optional time, and a snapshot. A food, recipe or quick entry. | [Diary](DOMAIN.md#diary) |
| dietary reference value | The default for a micro goal, by sex and age band: EFSA's population reference intake, else its adequate intake, else another body's figure. | [Body and goals](DOMAIN.md#body-and-goals), [Data sources](DATA-SOURCES.md) |
| favourite | A food a user marked to find again quickly. Theirs alone; goes with the food. | [Diary](DOMAIN.md#diary) |
| food | Anything with a nutrient vector per 100 g: a reference product, a generic food or a user's own. One table. | [Foods](DOMAIN.md#foods) |
| food import | One run of the importer over some sources: queued, running, succeeded or failed, with its counts. One runs at a time. | [Foods](DOMAIN.md#foods) |
| food entry | A diary entry for a food: the food, a quantity, a portion and the grams they resolved to. | [Diary](DOMAIN.md#diary) |
| frequent foods | The 30 foods a user logged most often over the 90 days up to a date, ties to the one logged last. Each with its last logged amount. | [Diary](DOMAIN.md#diary) |
| generic source | `ciqual`, `cofid` or `usda`. A user chooses which of them appear in their search. | [Foods](DOMAIN.md#foods) |
| goal | Derived or manual; either way it yields a goal vector. Goals warn, never block. | [Body and goals](DOMAIN.md#body-and-goals) |
| goal settings | An account's goal mode, weekly rate, protein in g per kg, fat share and overrides. One per account, no history. | [Body and goals](DOMAIN.md#body-and-goals) |
| goal vector | A target per nutrient for a date, computed live from the latest weight on or before it. Never stored. | [Body and goals](DOMAIN.md#body-and-goals), [ADR 0011](adr/0011-derive-goals-live-from-the-profile-and-the-latest-weight.md) |
| Google | A way to sign in whose confirmation of the address stands in for the mailed link. Attaches to the user with the same address. | [Accounts](DOMAIN.md#accounts), [ADR 0008](adr/0008-link-google-to-the-account-on-the-same-confirmed-address.md) |
| importer | The in-server job that upserts what source adapters stream and archives what a run no longer sees. | [Foods](DOMAIN.md#foods) |
| ingredient | A food or a recipe, with grams, in a recipe's ordered list. | [Recipes](DOMAIN.md#recipes) |
| last logged amount | The portion and quantity of a food's latest food entry, or one default portion when there is none or that portion is gone. What one tap logs again. | [Diary](DOMAIN.md#diary) |
| manual goal | A goal with explicit targets instead of derived ones. | [Body and goals](DOMAIN.md#body-and-goals) |
| meal | `breakfast`, `lunch`, `dinner` or `snack`. Fixed. | [Diary](DOMAIN.md#diary) |
| meal totals | The sum of a meal's entry snapshots. Computed, never stored. | [Diary](DOMAIN.md#diary) |
| micro goal | The goal for a mineral, a vitamin, fibre, saturated fat or sugars, defaulting to its dietary reference value and overridable. | [Body and goals](DOMAIN.md#body-and-goals) |
| nutrient | One key in the closed canon in `lib/domain/nutrition/nutrients.ts`, with a unit, a group and a display order. | [Nutrients](DOMAIN.md#nutrients) |
| nutrient group | Energy, macros, fat detail, carbohydrate detail, minerals, vitamins, other — in that display order. | [Nutrients](DOMAIN.md#nutrients) |
| nutrient vector | A partial record from nutrient key to amount: per 100 g on a food, for its grams on an entry. Absent means unknown, not zero. | [Nutrients](DOMAIN.md#nutrients) |
| onboarding | The steps after a new account's first sign-in: the profile, then the goal settings with their defaults chosen. Every other page sends an account without a profile there. | [Body and goals](DOMAIN.md#body-and-goals) |
| original name | A generic food's name in its source's own language (CIQUAL's French). Searched, never shown. | [Foods](DOMAIN.md#foods) |
| override | An explicit target for one nutrient that wins over the goal vector's value for it, in either mode. | [Body and goals](DOMAIN.md#body-and-goals) |
| portion | A named quantity in grams for one food. Every food has `100 g`, `1 g` and `1 ml`. | [Foods](DOMAIN.md#foods) |
| profile | Sex, date of birth, height in cm and activity level. One per account, asked for at onboarding. | [Body and goals](DOMAIN.md#body-and-goals) |
| quick entry | A diary entry with a label and a nutrient vector typed directly, no food. | [Diary](DOMAIN.md#diary) |
| recent foods | The last 30 foods a user logged, each once, last logged first. Each with its last logged amount. | [Diary](DOMAIN.md#diary) |
| recipe | A name, servings, an optional cooked weight and ordered ingredients. Nests one level. Private. | [Recipes](DOMAIN.md#recipes) |
| recipe entry | A diary entry for a recipe: a number of servings or grams. | [Diary](DOMAIN.md#diary) |
| reference food | A food from a `source` other than `user`, written only by the importer. Upserted on `(source, source_id)`. | [Foods](DOMAIN.md#foods) |
| reset link | A mailed link to choose a new password; works once, expires in an hour, signs out every session. | [Accounts](DOMAIN.md#accounts) |
| search | Every word of a query against name and brand, the last as a prefix, diacritics ignored. A user's own foods first; archived foods never. | [Foods](DOMAIN.md#foods) |
| servings | How many portions a recipe yields. | [Recipes](DOMAIN.md#recipes) |
| session | What the app holds once a confirmed user signs in. The caller of every tRPC procedure that needs an account. | [Accounts](DOMAIN.md#accounts) |
| settings | Where an account changes its profile, goals, source preferences, API keys, export and the account itself. | [Accounts](DOMAIN.md#accounts) |
| sign-in method | Password or Google: a way an account signs in. Connected or not, shown in settings; the last one can never be disconnected. | [Accounts](DOMAIN.md#accounts), [ADR 0012](adr/0012-manage-sign-in-methods-through-the-account-router.md) |
| snapshot | The nutrient vector a diary entry resolved to when logged. Editing the food or recipe changes future entries only. | [Diary](DOMAIN.md#diary), [ADR 0003](adr/0003-diary-entries-snapshot-their-nutrients.md) |
| source | Where a food row came from: `off`, `ciqual`, `cofid`, `usda` or `user`. | [Foods](DOMAIN.md#foods) |
| source adapter | Streams one upstream dataset as `SourceFood` records for the importer. | [Foods](DOMAIN.md#foods) |
| source preferences | Which generic sources a user's search includes, and their order. All enabled by default; Open Food Facts is always on. | [Foods](DOMAIN.md#foods) |
| target | A goal to reach. Every goal is a target unless it is an upper limit. | [Body and goals](DOMAIN.md#body-and-goals) |
| trace | A nutrient a source declares as below a limit or as "traces": stored as zero and listed among the food's traces. | [Foods](DOMAIN.md#foods) |
| TDEE | Total daily energy expenditure: BMR times the activity multiplier. | [Body and goals](DOMAIN.md#body-and-goals) |
| trend weight | An exponential moving average over the weight log, a tenth of the way toward each weight, carried over the days without one. | [Body and goals](DOMAIN.md#body-and-goals) |
| upper limit | A goal to stay under: saturated fat, sugars, sodium and chloride. | [Body and goals](DOMAIN.md#body-and-goals) |
| user food | A food with `source` `user`: owned by one user, visible only to them, may carry a barcode. | [Foods](DOMAIN.md#foods) |
| weekly rate | How much the trend weight changed over a range, per week. A range under a week has none. | [Body and goals](DOMAIN.md#body-and-goals) |
