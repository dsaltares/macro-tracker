# Macro Tracker — Domain

The vocabulary every issue, ADR and module uses. Keep it short; detail belongs in
`lib/domain/` and its tests.

## Accounts

A **user** signs up with an email address and a password, and has an **account** once the
address is **confirmed** by following the link mailed to it. Until then there is no session and
nothing to own. A **session** is what the app holds once a confirmed user signs in; every user
datum is reached through the session's user, never an id from input. A forgotten password is
replaced by following a **reset link**, which signs out every session.
A user may also sign in with **Google**, whose confirmation of the address stands in for the
mailed link. A Google sign-in on an address that already has a user attaches to that user, so it
lands in the same diary; an account with only Google has no password until one is set.
Password and Google are the account's **sign-in methods**. Settings lists them; an account can
connect Google (on the same address only), set a password if it has none, and disconnect either,
but never the last one, so it can always sign in.

What a user logs about their food and weight is health data, so signing up records their
**consent**: agreeing to the terms and acknowledging the privacy policy, with the time they did,
before an account exists. A later change to those documents does not ask again.

**Settings** is where an account changes what it told the app: its profile, its goals, its source
preferences, its API keys, an export, and the account itself. **Deleting the account** is
confirmed by typing its address, and removes the user and everything they own (sessions, sign-in
credentials, profile, diary, favourites, source preferences, their own foods and portions) in one
statement, then signs them out. Withdrawing consent is deleting the account.

## Nutrients

A **nutrient** is one entry in the canonical list in `lib/domain/nutrition/nutrients.ts`: a key,
a unit (`kcal`, `g`, `mg`, `µg`), a group and a display order. The list is closed; adding a
nutrient is a migration and a code change, never a free-text key. Sodium and kcal are canonical;
salt and kJ are derived for display (ADR [0004](adr/0004-one-canonical-nutrient-vector-per-100-g-in-wide-columns.md)).

Groups, in display order:

1. **Energy** — `energy_kcal` (kJ is derived: × 4.184).
2. **Macros** — `protein`, `carbohydrate`, `fat`, `fibre`, `alcohol`, `water`.
3. **Fat detail** — `saturated_fat`, `monounsaturated_fat`, `polyunsaturated_fat`, `trans_fat`,
   `omega_3`, `omega_6`, `cholesterol`.
4. **Carbohydrate detail** — `sugars`, `added_sugars`, `starch`, `polyols`.
5. **Minerals** — `sodium` (salt is derived: × 2.5), `potassium`, `chloride`, `calcium`,
   `phosphorus`, `magnesium`, `iron`, `zinc`, `copper`, `manganese`, `fluoride`, `selenium`,
   `chromium`, `molybdenum`, `iodine`.
6. **Vitamins** — `vitamin_a`, `vitamin_d`, `vitamin_e`, `vitamin_k`, `vitamin_c`, `thiamin`,
   `riboflavin`, `niacin`, `vitamin_b6`, `folate`, `vitamin_b12`, `biotin`, `pantothenic_acid`,
   `choline`.
7. **Other** — `caffeine`.

The EU mandatory label (Reg. 1169/2011) is energy, fat, saturates, carbohydrate, sugars, protein,
salt, and the day view shows those first.

A **nutrient vector** is a partial record from nutrient key to amount. Reference and user foods
hold one **per 100 g**. A diary entry holds the one it resolved to **for its grams**. Vectors are
scaled and summed in `lib/domain/nutrition/`, which is pure and is where coverage is measured.

## Foods

A **food** is anything with a nutrient vector per 100 g: a reference product, a generic food, or
a user's own. One table; `source` says where a row came from:

- `off` — Open Food Facts. Barcoded products: brand, quantity, usually a serving size. Few micros.
- `ciqual` — ANSES CIQUAL (France). Generic foods ("Chicken breast, grilled"), 74 constituents.
- `cofid` — McCance and Widdowson's CoFID (UK). Generic foods, full nutrient profile.
- `usda` — USDA FoodData Central: Foundation and SR Legacy for depth, FNDDS for household portions
  ("1 cup", "1 medium"). A food in both Foundation and SR Legacy is one food, Foundation's values
  first and SR Legacy's for any nutrient Foundation lacks. An FNDDS food that is just one of those
  lends it its portions; any other FNDDS food is a food of its own.
- `user` — created by a user, by hand, from quick add, or from a label scan. Has an owner and is
  visible only to them. May carry a barcode, which no other of their live foods has.

A **source adapter** streams one upstream dataset as `SourceFood` records
(`lib/domain/foods/source-food.ts`): canonical nutrients per 100 g, whatever the upstream keys,
units and basis were (ADR [0005](adr/0005-import-reference-foods-in-the-server-open-food-facts-first.md)).
The **importer** runs inside the server, upserts them and archives what a run no longer sees.
Most adapters read a whole dataset. A **delta** adapter reads only what changed upstream since it
last succeeded (Open Food Facts publishes a file of changed products a day); a delta never says
what was removed, so its run only upserts and never archives. Only a full run archives.
Each run is a **food import**: the sources it read, `queued`, `running`, `succeeded` or `failed`,
and how many foods it inserted, updated and archived. Only one runs at a time. A
user's **source preferences** choose which generic sources appear in their search, and in what
order they are listed; every one is enabled until the user says otherwise. Open Food Facts and
their own foods always appear.

**Search** matches every word of a query against a food's name and brand, the last word as a
prefix, ignoring case and diacritics ("jamon" finds "Jamón"). A user's own foods rank above
reference foods, then the closest match first; archived foods never appear.

A food's **name** is what the app shows. A generic food from a table published in another language
also keeps its **original name** (CIQUAL's French, "Pomme, chair et peau, crue"), which search
matches and the app does not show. Who each source is and its licence are in
[`DATA-SOURCES.md`](DATA-SOURCES.md).

A **trace** is a nutrient a source declares as below a limit (`< 0.5 g`) or as "traces" ("Tr"). It
is stored as zero, and the food lists it among its traces so it can be shown as such.

`(source, source_id)` is the upsert key for reference foods. A reference food that disappears
upstream is **archived**: hidden from search, still resolvable from the diary.

A user's **foods** are their own foods that are not archived. They are typed from a label: the
EU label per 100 g, or per serving with the serving's grams, which the app turns into per 100 g;
salt for sodium; any other nutrient; and the food's own portions. Editing a food changes future
entries only. A user **archives** a food they no longer want: it leaves their foods, search and
barcode lookup, and stays resolvable from the diary.

A **portion** is a named quantity in grams for one food ("1 serving = 30 g", "1 tbsp = 15 g").
Every food has `100 g`, `1 g` and `1 ml`; a reference food may add its upstream serving; a user adds
their own, to their foods or to a reference food, and only they see them. A food never shows one
user two portions with the same label. A food's **default portion** is the first of its own
portions, or `100 g` when it has none. Millilitres are grams unless a food declares a density, and
no food declares one yet. A quantity of a portion weighs the portion's grams times the quantity.

A **barcode** is an EAN-8 or EAN-13 (UPC-A is normalised to EAN-13 by a leading zero). Lookup
order: the caller's own foods, reference foods, live Open Food Facts, then the miss flow.

## Diary

A **diary entry** belongs to a user, a **date** (the user's local calendar day as `YYYY-MM-DD`,
never a timestamp) and a **meal** (`breakfast`, `lunch`, `dinner`, `snack`), with an optional
time. It is one of:

- a **food entry** — food, quantity, portion, resolved grams;
- a **recipe entry** — recipe, number of servings or grams;
- a **quick entry** — a label and a nutrient vector typed directly.

Every entry **snapshots** the nutrient vector it resolved to. A snapshot without energy takes the
kcal of its macros (4 per gram of protein and carbohydrate, 9 of fat, 7 of alcohol). Editing a
food, a recipe or re-importing reference data changes future entries only.

**Meal totals** and **day totals** are sums over the snapshots, computed, never stored.

**Copying a meal** adds a copy of each of its entries, snapshots as they are, to another date and
meal; the originals stay. **Clearing a meal** deletes every entry of one meal on one date.

A **favourite** is a food a user has marked to find again quickly. It is theirs alone, and goes
when the food does.

A user's **recent foods** are the last 30 foods they logged, each once, last logged first. Their
**frequent foods** are the 30 they logged most often over the 90 days up to a date, ties going to
the one logged last. Recent foods, frequent foods and favourites each carry the food's **last
logged amount**, the portion and quantity of its latest food entry, so one tap logs it again; a
food never logged, or whose portion is gone, carries one of its default portion.

## Body and goals

A **profile** is sex (female or male, what the energy and reference value equations take), date
of birth, height in cm and an **activity level** (sedentary, light, moderate, active, very active,
with the usual 1.2 to 1.9 multipliers). An account is between 16 and 120 years old by its date of
birth. A new account goes through **onboarding**, which asks for the profile, before anything
else, and is sent back to it until a profile exists; then it offers the goal settings with their
defaults chosen, to keep or change. After that both are edited in settings.

A **body measurement** is a user, a date, a metric and a value. Only `weight_kg` ships in v1.
The **trend weight** is an exponential moving average over the log: it starts at the first weight
and moves a tenth of the way toward each next one, carried unchanged over the days without a
weight. The **weekly rate** is how much the trend weight changed over a range, per week; a range
that spans less than a week has none.

**BMR** is Mifflin-St Jeor over profile and latest weight, with the age on the date. **TDEE** is
BMR times the activity multiplier. A **goal** is either *derived* — a weekly rate target in kg
(negative to lose), a protein target in g per kg of body weight, a fat share of energy,
carbohydrate as the remainder — or *manual*, with explicit targets. A derived goal's kcal target is
TDEE plus the weekly rate at 7,700 kcal per kg, spread over seven days; its fibre is 14 g per
1,000 kcal. Either way the result is a **goal vector**: a target per nutrient, computed live for a
date from the latest weight on or before it, never stored (ADR
[0011](adr/0011-derive-goals-live-from-the-profile-and-the-latest-weight.md)).

The **goal settings** are one per account: the mode, the weekly rate, protein in g per kg and the
fat share, which default to a derived goal at 0 kg a week, 1.6 g per kg and 30% of energy, and the
**overrides**, an explicit target per nutrient. An override wins over the goal vector's value for
that nutrient only, in either mode. A manual goal is its overrides over the micro defaults at its
own kcal target, so it needs one and no weight; a derived goal needs a weight on or before the
date, and there is none before the first.

The **micro goals** default to **dietary reference values**: EFSA's population reference intake
where it has one, otherwise its adequate intake, by sex and **age band** (18–24, 25–50, 51–70, 71+;
an account of 16 or 17 is in the youngest), each overridable. Thiamin and niacin are set per MJ and
scale with the day's kcal target. Every goal is a **target** to reach or an **upper limit** to stay
under, and the two are coloured differently. The upper limits are saturated fat (10% of energy),
sugars (90 g), sodium (2 g) and chloride (3.1 g). Where EFSA sets no number, the goal comes from
another body: saturated fat from the WHO, sugars and chromium from the EU reference intakes (Reg.
1169/2011, Annex XIII). Zinc assumes a moderate phytate intake (600 mg a day), and a woman's iron
drops from 16 to 11 mg at 51, EFSA's postmenopausal value. Sources and retrieval are in
[`DATA-SOURCES.md`](DATA-SOURCES.md).

Goals **warn, never block**: an aggressive goal shows a warning, and still saves. A derived goal
warns when its kcal target is under 1,200 for a woman or 1,500 for a man, when its weekly rate is
over 1 kg either way, and when protein and fat leave no energy for carbohydrate, which is then
zero.

## Trends

Trends read the diary over a range of dates, at most 366 of them. Each date's **daily totals** are
its day totals; a date with at least one entry is a **logged day**, and a date with none is shown
as one but left out of every average, so a day not logged never reads as a day of fasting.

A nutrient's **average** over a range is the sum of its daily totals over the logged days divided
by their number, a logged day without that nutrient counting as zero. It is read against the
average of the goal vectors of those logged days that have one. The **rolling average** of a date
is the average over the logged days of the seven ending on it, reaching back before the range;
a date with no logged day in its seven has none.

**Adherence** is the share of logged days with a kcal goal whose energy is within 10% of it either
way. A logged day without a goal (a derived goal before the first weight) is not counted, and a
range without one such day has no adherence.

## Recipes

A **recipe** has a name, a number of **servings**, an optional **cooked weight** in grams and
ordered **ingredients**, each a food or another recipe with grams. A recipe can contain a recipe,
but that one cannot contain another (one level). Its nutrient vector per serving and per 100 g
are computed from its ingredients' current values; logging it snapshots the result.

## API

The **app** talks tRPC with a session. **API clients** talk REST under `/api/v1` with a bearer
**API key**: several per user, named, scoped `read` or `write`, stored hashed, shown once,
revocable. Both go through the same service functions, so a behaviour exists in both or neither.
