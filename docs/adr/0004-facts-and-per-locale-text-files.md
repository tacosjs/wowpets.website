# 0004: Facts and text in separate, per-locale files

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The site ships in `en` (base) and `fr`, with more locales possible. Most text on a look page is
written by contributors (NPC notes, look names), plus official game names (NPCs, zones,
abilities). Translators need to translate a whole pet without touching facts. Contributors need
to add facts without breaking translations.

## Decision
- **Facts:** `data/<version>/…` files hold only language-neutral values.
- **Text:** names, titles and notes go in `data/<version>/locales/<locale>/…`, at the same path
  as the facts file, keyed by slug or NPC id.
- **English is the source of truth:** `en` must be complete (checked). Other locales may leave
  out any file or key, and English fills the gap key by key at read time.
- **No orphan text:** a locale file can't name a fact that doesn't exist (checked). Missing
  translations are only reported as a coverage count.
- **Rules text in Paraglide:** wording that follows from a flag ("exotic family", "keeps its
  name", conditions, zone kinds) is a Paraglide message, never data. Conditions are structured
  (`{ "kind": "quest" }`), and only real free-form notes need translating.
- **Numbers stay neutral:** Classic rank values stay in facts as `effect`, and the description
  holds an `{effect}` placeholder.

## Alternatives passed over
- **Inline maps (`"name": { "en": …, "fr": … }`):** a translator would edit every facts file,
  every language's text gets mixed into each diff, and adding a locale touches thousands of files.
- **One big file per locale:** no structure to work through, merge conflicts on every change,
  and no way to tell which look is untranslated.

## Consequences
- Translating a pet means filling one file in the `fr/` folder, and a missing file shows up
  right away in the mirrored tree.
- Adding a locale means adding a folder, with no schema change.
- Each look is two files, or three with French. The integrity check keeps them in sync.
