# 0001: Game data as JSON files in the repository

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The site lists hunter pet families, looks (skins) and the NPCs that carry them, much like
wow-petopia.com. The data is mostly static. It changes with game patches and community
corrections, and it's edited by people, later also by import scripts. Pages are server-rendered.

## Decision
- **Storage:** data lives in `data/` as plain JSON files, committed to git.
- **Validation:** Zod schemas (`src/data/schema/`) validate each file. Cross-file rules
  (references resolve, ids are unique, English text is complete) run in `pnpm data:check`.
  Every error names the file and the key path.
- **IDs:**
  - Game objects keep their numeric Blizzard ids (NPC, spell, display, quest, creature family),
    so localized names can be imported from game data later.
  - Everything else uses stable English kebab-case slugs, which are also the URL slugs in every
    locale.

## Alternatives passed over
- **Database or headless CMS:** extra infrastructure and cost for read-only data. It also puts
  edits outside code review and history.
- **TypeScript modules** (`defineLook({...})`): typed for free, but type-checking thousands of
  literals gets slow. Generated files are noisier, and contributors must edit code.
- **YAML:** nicer for long notes, but adds a parser and has known gotchas (implicit types,
  indentation). JSON matches `messages/*.json`, and Vite imports it natively.

## Consequences
- Every data change is a reviewable diff, and invalid data fails CI before it ships.
- No runtime dependency: the data is bundled into the server build (see 0005).
- Bulk edits need scripts, not a UI. Revisit if non-technical editors need to contribute.
