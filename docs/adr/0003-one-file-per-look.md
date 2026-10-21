# 0003: One file per look, with its NPCs inside

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The site's hierarchy is family → model group → look → NPCs. The look page (one skin and every
creature that has it, tameable or not) is the main unit, both for readers and for contributors
who add a newly found NPC. Each version has roughly 1–2k looks and 5k+ NPCs.

## Decision
- **Families:** `families/<family>.json` holds the family's facts and its ordered model groups.
- **Looks:** `looks/<look>.json` holds the look's facts and an array of its NPCs.
- **One definition per NPC:** each NPC is defined in exactly one look. If an NPC can show
  several looks, the others list its id in `alsoNpcs`, and the integrity check rejects
  duplicates.
- **Derived values:** look status (tameable, untameable, unused) and Classic ability teachers
  are computed from the NPCs, never stored.

## Alternatives passed over
- **One file per NPC:** the most granular option. But a look page would gather dozens of files,
  you'd need a separate file for each look anyway, and there would be 5k+ files per version.
- **One file per family:** few files, but very large ones (wolves have hundreds of NPCs), which
  makes merge conflicts likely.

## Consequences
- One look is one reviewable file pair (facts and English text). Diffs stay local to what changed.
- An NPC's facts live in one place, so data can't drift between copies.
- Finding a look by NPC needs an index, which the loader builds at startup.
