# 0002: One independent data tree and schema per game version

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The site covers three game versions: Retail, Classic and Forever. Their pet systems differ a lot:
- **Retail:** specs, exotic families, required taming skills.
- **Classic:** training points, ability ranks, abilities learned from tamed beasts.
- **Forever:** 1.x-based, with family abilities and new families. Its rules aren't fully
  published.

The same NPC, zone or family can have different facts in each version.

## Decision
- **Data:** each version has its own tree, `data/<version>/`, with no data shared between
  versions.
- **Schemas:** each version has its own module, `src/data/schema/<version>.ts`, and registers
  its own integrity rules in `src/data/versions.ts`.
- **Shared code:** only small building blocks are shared, in `schema/common.ts`: slugs, ids,
  levels, locations, conditions, text shapes. Parsing, integrity checks, localization and views
  are written once against those building blocks.

## Alternatives passed over
- **Shared core with per-version overrides:** less duplication, but every record would need
  merge rules, and a change for one version could silently affect another. Versions that diverge
  this much would end up as mostly overrides.
- **One schema with optional fields for all versions:** simple at first, but it lets
  version-specific fields leak everywhere, and validation can't tell which fields apply.

## Consequences
- A version can change its model (e.g. Forever, once its rules ship) without touching the others.
- Names that are the same across versions are duplicated. Import scripts are expected to fill
  them, so this costs little.
- Views are typed as a union over versions (`versionId` is the discriminant), so the UI narrows
  before using version-specific fields.
