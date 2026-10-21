# 0006: Retail import from Petopia facts plus game data, with a non-destructive merge

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
We need the full Retail list of tameable beasts: about 60 families and thousands of looks and
NPCs. Game files have creature names and families, but they don't say which creatures are
tameable, nor their levels or locations. wow-petopia.com is the only curated source of that, and
its content is "All rights reserved".

## Decision
- **Import script:** `pnpm import:retail` (`scripts/import/`) builds the Retail data from two
  sources.
- **From Petopia, facts only:**
  - family, model group membership and order
  - which NPC IDs show which look
  - the tameable flag, level, classification and location of each NPC
  - family diet, spec, exotic flag and required skill
  - ability spell IDs

  It also takes Petopia's short labels (color words, model-group labels) as English
  placeholders. Notes and images are never imported. Notes are read only to set the
  `keepsName` flag.
- **From game data (wago.tools DB2 CSVs):** official names in en and fr for zones, abilities,
  families and the NPCs the table covers. Zone IDs and parents come from there too.
- **Polite fetching:** about 1 request/s with an identifying User-Agent, and every response
  cached under `.cache/import/` (gitignored), so re-runs are offline.
- **Merge, so it's safe to re-run:**
  - Imported facts win, but fields Petopia doesn't provide are kept (coords, hand-added
    conditions).
  - Text files only gain missing keys; existing strings are never replaced.
  - An NPC keeps the look it already lives in. A new NPC lives in the first look that lists it,
    and the others reference it via `alsoNpcs`.
  - Looks and NPCs that Petopia no longer lists are kept and reported as stale.
  - The only deletion: `zones.json` entries that no look references (and their text), since
    that file is an index of the looks' locations.
- **Report:** each run writes `.cache/import/retail-report.json` (counts, unmatched zones,
  unknown tokens, warnings, French coverage).

## Alternatives passed over
- **Copy Petopia wholesale** (notes, screenshots, names): fastest, but copies copyrighted
  editorial work.
- **Game data only:** fully independent, but over-inclusive. It doesn't know what's tameable or
  where, so it would need manual curation of thousands of creatures.
- **One-off conversion:** simpler, but it can't pick up Petopia's updates after a patch without
  clobbering our edits.

## Consequences
- The full list exists and stays updatable, and our notes and translations are safe across
  re-runs.
- French NPC names are sparse, because the game's creature table is partial. A follow-up could
  use Blizzard's Game Data API (needs an API key) for the rest.
- The look and group labels are Petopia's wording, used as placeholders to rewrite.
- **Petopia's owner should be contacted before the site is public.** Permission would also
  allow importing more.
