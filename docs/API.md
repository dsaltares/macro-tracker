# API

Log food, read the diary and follow goals from a script, a shortcut or an agent, over plain HTTP
and JSON with an API key. The API lives under `/api/v1` of your deployment, so in development it is
`http://localhost:3014/api/v1`.

- The OpenAPI document is at [`/api/v1/openapi.json`](http://localhost:3014/api/v1/openapi.json),
  generated from the same Zod schemas that validate every request.
- The reference, rendered from it, is at [`/api/docs`](http://localhost:3014/api/docs). It has every
  field, every error and an example of every request and response, and can send requests.

Everything below runs against a local server. Set these two once:

```sh
export API=http://localhost:3014/api/v1
export KEY=mt_…   # from Settings › API keys
```

## Create a key

In the app, open **Settings › API keys**, give the key a name and choose its scopes:

- `read` — every `GET`: the account, foods, the diary, measurements, goals, recipes and trends.
- `write` — everything else: logging and changing entries, creating foods, logging weights,
  setting goals. `write` does not include `read`; a key that does both needs both.

The key is shown **once**, in a dialog to copy. Afterwards the app shows only its prefix, the first
eight characters, beside when it was created and last used. Revoke a key there and it stops working
at once.

## Authenticate

Send the key on every request:

```sh
curl -sS "$API/me" -H "Authorization: Bearer $KEY"
```

```json
{
  "id": "0f9e8d7c-…",
  "email": "ana@example.com",
  "name": "Ana",
  "profile": { "sex": "female", "birthDate": "1990-04-02", "heightCm": 168, "activityLevel": "moderate" },
  "apiKey": { "name": "Shortcuts", "prefix": "mt_3kF9x", "scopes": ["read"] }
}
```

Without a key, with an unknown or revoked one, the answer is `401`; with a key that lacks the
endpoint's scope, `403`.

## Errors

Every error, whatever its status, is one envelope:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request is not valid.",
    "issues": [{ "path": ["date"], "message": "Not a date" }]
  }
}
```

`issues` is only there for `INVALID_REQUEST`, one per problem with the path, the query or the body.

| Status | Code                 | When                                                             |
| ------ | -------------------- | ---------------------------------------------------------------- |
| 400    | `INVALID_REQUEST`    | The query, body or path did not validate, or the body is not JSON |
| 401    | `MISSING_API_KEY`    | No `Authorization: Bearer` header                                |
| 401    | `INVALID_API_KEY`    | The key is not one this server issued                            |
| 401    | `REVOKED_API_KEY`    | The key was revoked                                              |
| 403    | `INSUFFICIENT_SCOPE` | The key lacks the scope the endpoint needs                        |
| 404    | `NOT_FOUND`          | No such food, entry, recipe or measurement, or no such endpoint  |
| 409    | `CONFLICT`           | The caller already has a food with that barcode, or an entry's food or recipe is gone |
| 500    | `INTERNAL_ERROR`     | Something failed on the server; nothing about it is in the body  |

Every response carries `Cache-Control: no-store`. The endpoints each list the codes they can
answer in the reference.

## Pagination

A list answers a page:

```json
{ "items": [ … ], "nextCursor": "b2Zmc2V0OjMw" }
```

Send `nextCursor` back as `?cursor=` for the next page, and stop when it is `null`. The cursor is
opaque; a cursor this API did not return is `400`. Food search pages by 30, measurements by 100,
recipes by 50.

```sh
curl -sS "$API/foods?q=oats&cursor=b2Zmc2V0OjMw" -H "Authorization: Bearer $KEY"
```

## Dates, times and nutrients

- A **date** is the user's local day as `YYYY-MM-DD`. A **time** is `HH:MM`, or `null`.
- **Nutrients** are objects keyed by canonical nutrient name, each amount in that nutrient's unit:
  `energy_kcal` in kcal, the macros, fibre, sugars and fatty acids in g, most minerals and some
  vitamins in mg, the rest in µg. The `NutrientVector` schema in the reference lists every key with
  its unit. A food's `nutrients` is per 100 g and names **every** key, `null` where the food does
  not declare it. Everywhere else a nutrient nothing declared is simply absent.
- A **portion** is `{ label, grams }`. Every food has `100 g`, `1 g` and `1 ml`, plus the ones its
  source declares and the caller's own. An amount is logged as a `quantity` of a portion named by
  its `label`.

## Endpoints

### Account

```sh
curl -sS "$API/me" -H "Authorization: Bearer $KEY"
```

### Foods

Search. Words of the name or brand, in any order; the caller's own foods come first.

```sh
curl -sS "$API/foods?q=porridge+oats" -H "Authorization: Bearer $KEY"
```

```json
{
  "items": [
    {
      "id": "7d1f4c2e-…",
      "source": "off",
      "name": "Porridge oats",
      "brand": "Flahavan's",
      "quantityLabel": "1 kg",
      "defaultPortion": { "label": "1 serving (40 g)", "grams": 40 },
      "nutrients": { "energy_kcal": 379, "protein": 11.7, "carbohydrate": 60.4, "fat": 7.6, "fibre": 9.1, "alcohol": null, … }
    }
  ],
  "nextCursor": null
}
```

One food, with every portion it can be logged in:

```sh
curl -sS "$API/foods/7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f" -H "Authorization: Bearer $KEY"
```

Its portions alone:

```sh
curl -sS "$API/foods/7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f/portions" -H "Authorization: Bearer $KEY"
```

```json
{
  "items": [
    { "id": "c2a8e4b6-…", "label": "1 serving (40 g)", "grams": 40, "source": "upstream" },
    { "id": null, "label": "100 g", "grams": 100, "source": "standard" },
    { "id": null, "label": "1 g", "grams": 1, "source": "standard" },
    { "id": null, "label": "1 ml", "grams": 1, "source": "standard" }
  ],
  "nextCursor": null
}
```

By barcode, an EAN-8, EAN-13 or UPC-A as printed. Anything else is `400`; a barcode nobody has is
`404`.

```sh
curl -sS "$API/foods/barcode/5010029000016" -H "Authorization: Bearer $KEY"
```

Create a food of your own, per 100 g. Leave out what the label does not say; `100 g`, `1 g` and
`1 ml` are always portions, so only name the others. Answers `201` with the food, or `409` when you
already have a food with that barcode.

```sh
curl -sS "$API/foods" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "name": "Homemade granola",
  "nutrients": { "energy_kcal": 450, "protein": 11, "carbohydrate": 60, "fat": 18, "fibre": 7, "sugars": 15 },
  "portions": [{ "label": "1 bowl", "grams": 45 }]
}'
```

### Diary

A day: every entry by meal, in meal order, with the totals of each meal and of the day.

```sh
curl -sS "$API/diary/2026-10-20" -H "Authorization: Bearer $KEY"
```

```json
{
  "date": "2026-10-20",
  "meals": [
    {
      "meal": "breakfast",
      "entries": [
        {
          "id": "2c4e6a8b-…",
          "kind": "food",
          "date": "2026-10-20",
          "meal": "breakfast",
          "time": "07:30",
          "label": "Porridge oats",
          "foodId": "7d1f4c2e-…",
          "recipeId": null,
          "quantity": 1,
          "portion": "1 serving (40 g)",
          "grams": 40,
          "nutrients": { "energy_kcal": 151.6, "protein": 4.68, "carbohydrate": 24.16, "fat": 3.04, … },
          "createdAt": "2026-10-20T06:31:12.000Z",
          "updatedAt": "2026-10-20T06:31:12.000Z"
        }
      ],
      "totals": { "energy_kcal": 151.6, "protein": 4.68, … }
    },
    { "meal": "lunch", "entries": [], "totals": {} },
    { "meal": "dinner", "entries": [], "totals": {} },
    { "meal": "snack", "entries": [], "totals": {} }
  ],
  "totals": { "energy_kcal": 151.6, "protein": 4.68, … }
}
```

Log a food, by one of its portions. `time` is optional. Answers `201` with the entry, whose
`nutrients` are a snapshot of the food as it is now.

```sh
curl -sS "$API/diary/entries" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "kind": "food",
  "date": "2026-10-20",
  "meal": "breakfast",
  "time": "07:30",
  "foodId": "7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f",
  "portion": "1 serving (40 g)",
  "quantity": 1
}'
```

Log a recipe, by `servings` or by `grams`, one of the two:

```sh
curl -sS "$API/diary/entries" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "kind": "recipe",
  "date": "2026-10-20",
  "meal": "lunch",
  "recipeId": "b3c5d7e9-1f2a-4b4c-8d6e-0f1a2b3c4d5e",
  "servings": 1
}'
```

Log a quick entry when nothing in search matches: either amounts per 100 g with the grams eaten,
or the totals eaten. Energy is worked out from the macros when left out. With `saveAsFood: true`
the amounts per 100 g also become a food of your own, so search finds it next time.

```sh
curl -sS "$API/diary/entries" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "kind": "quick",
  "date": "2026-10-20",
  "meal": "snack",
  "label": "Flat white",
  "nutrients": { "totals": { "energy_kcal": 120, "protein": 6, "carbohydrate": 9, "fat": 6 } }
}'
```

Log a whole meal in one request, all or nothing: any mix of foods, recipes and quick entries,
each becoming its own entry. Answers `201` with the entries. When an item fails, the message says
which one, counting from one, and nothing is logged.

```sh
curl -sS "$API/diary/meals" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "date": "2026-10-20",
  "meal": "dinner",
  "time": "20:00",
  "items": [
    { "kind": "food", "foodId": "7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f", "portion": "1 serving (40 g)", "quantity": 1 },
    { "kind": "recipe", "recipeId": "b3c5d7e9-1f2a-4b4c-8d6e-0f1a2b3c4d5e", "amount": { "servings": 1 } },
    { "kind": "quick", "label": "Glass of red wine", "nutrients": { "totals": { "energy_kcal": 125, "carbohydrate": 4 } } }
  ]
}'
```

Change an entry. Send only what changes: a new `quantity` or `portion` re-resolves the nutrients
from the food or recipe as it is now, and is `409` when that food or recipe is gone; a new `date`,
`meal` or `time` keeps them.

```sh
curl -sS -X PATCH "$API/diary/entries/2c4e6a8b-0d1f-4a3b-8c5d-9e7f6a5b4c3d" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{ "quantity": 2 }'
```

Remove one. Answers `204`.

```sh
curl -sS -X DELETE "$API/diary/entries/2c4e6a8b-0d1f-4a3b-8c5d-9e7f6a5b4c3d" -H "Authorization: Bearer $KEY" -o /dev/null -w '%{http_code}\n'
```

Copy a meal to another day. Answers the new entries.

```sh
curl -sS "$API/diary/copy" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "fromDate": "2026-10-19",
  "meal": "breakfast",
  "toDate": "2026-10-20",
  "toMeal": "breakfast"
}'
```

### Body

The weight log, newest first, over an optional inclusive range:

```sh
curl -sS "$API/measurements?metric=weight_kg&from=2026-10-01&to=2026-10-20" -H "Authorization: Bearer $KEY"
```

Log today's weight, in kg. A day has one weight; logging it again replaces it and keeps the id.
Answers `201`.

```sh
curl -sS "$API/measurements" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{ "date": "2026-10-20", "metric": "weight_kg", "value": 71.4 }'
```

Remove one. Answers `204`.

```sh
curl -sS -X DELETE "$API/measurements/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" -H "Authorization: Bearer $KEY" -o /dev/null -w '%{http_code}\n'
```

### Goals

The settings and the goal they give on a date. `goal` is `null` without a profile, or without a
weight for a derived goal.

```sh
curl -sS "$API/goals?date=2026-10-20" -H "Authorization: Bearer $KEY"
```

```json
{
  "date": "2026-10-20",
  "settings": { "mode": "derived", "weeklyRateKg": -0.25, "proteinGPerKg": 1.6, "fatEnergyShare": 0.3, "overrides": { "fibre": 30 } },
  "goal": {
    "mode": "derived",
    "weightKg": 71.4,
    "bmr": 1452,
    "tdee": 2251,
    "nutrients": { "energy_kcal": 1976, "protein": 114.2, "fat": 65.9, "carbohydrate": 231.5, "fibre": 30, … },
    "warnings": []
  }
}
```

Replace the settings. In `manual` mode `overrides.energy_kcal` is required.

```sh
curl -sS -X PUT "$API/goals" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "mode": "derived",
  "weeklyRateKg": -0.25,
  "proteinGPerKg": 1.6,
  "fatEnergyShare": 0.3,
  "overrides": { "fibre": 30 }
}'
```

### Recipes

```sh
curl -sS "$API/recipes" -H "Authorization: Bearer $KEY"
curl -sS "$API/recipes/b3c5d7e9-1f2a-4b4c-8d6e-0f1a2b3c4d5e" -H "Authorization: Bearer $KEY"
```

A recipe comes with its ingredients and its nutrients in total, per serving and per 100 g, and the
two portions, `1 serving` and `100 g`, it is logged in.

### Trends

Each day of an inclusive range of at most 366 days: its totals, whether anything was logged, the
rolling seven-day average and the goal on that date, plus adherence, the share of logged days within
10% of their energy goal.

```sh
curl -sS "$API/trends?from=2026-10-01&to=2026-10-20" -H "Authorization: Bearer $KEY"
```

## For agents

The API is exact: ids, portion labels and nutrient keys have to be the ones it returned, so read
before you write. To log something a person ate:

1. `GET /me` once, to check the key and that it has `write`.
2. `GET /foods?q=` with the words of the food. Prefer a `user` source over a reference one when both
   match; prefer a brand match when a brand was named.
3. Take the `id` and a portion from the match: `defaultPortion.label`, or one of
   `GET /foods/{id}/portions` when a different unit was named. Grams are always available as the
   `1 g` portion with `quantity` set to the grams.
4. `POST /diary/entries` with `kind: "food"`, the `date`, the `meal`, the `foodId`, the `portion`
   label and the `quantity`. The answer is the entry; keep its `id` to change or remove it.
5. When nothing matches, `POST /diary/entries` with `kind: "quick"` and the nutrients you know, per
   100 g with the grams, or as totals; add `saveAsFood: true` when you know them per 100 g, so the
   food exists next time.
6. For a meal of several things, `POST /diary/meals` once with every item instead of one request
   per entry: it logs all of them or none.

To report a day, `GET /diary/{date}` has every entry and the totals; `GET /goals?date=` has what
they are measured against; `GET /trends?from&to` has the days of a range.

Do not retry a `4xx`: it will fail the same way. A `400` says which field in `issues`. A `409` on a
`PATCH` means the food or recipe behind the entry is gone, so remove the entry and log the food
again.
