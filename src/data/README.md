# Pet data

All game data lives in `data/` as JSON. Each game version (`retail`, `classic`, `forever`) has its own tree and its own schemas (`schema/<version>.ts`). Run `pnpm data:check` after any edit.

## Layout

```
data/<version>/
  version.json              facts: id, patch?, wowheadBase?
  zones.json                facts: [{ id, wowId?, kind, parent? }]
  abilities.json            facts: [{ id, ... }]   (shape differs per version)
  families/<family>.json    facts for one family, incl. its model groups
  looks/<look>.json         facts for one look (skin) and the NPCs that have it
  locales/<locale>/...      text, same paths as the facts above
```

- **Facts** are language-neutral: ids, levels, flags, references. Game objects use numeric Blizzard ids (NPC, spell, quest, display). Everything else uses kebab-case slugs, which are also the URL slugs in every locale.
- **Text** (names, titles, notes) goes in `locales/<locale>/` at the facts file's path. `en` must be complete. Other locales may leave out any file or key, and English fills the gap key by key.
- **Each NPC is defined once**, in the look it belongs to. When another look can show the same NPC, list its id in that look's `alsoNpcs`.
- **Rules text** that follows from a flag (exotic, keeps its name, conditions, zone kind) comes from Paraglide messages in `messages/`. Don't write it into the data.

## Adding a look

1. Create `data/<version>/looks/<look-id>.json`. Its `family` and `modelGroup` must already exist.
2. Create `data/<version>/locales/en/looks/<look-id>.json` with `name`, `variant`, and an entry under `npcs` for every NPC id.
3. Optional: add the same file under `locales/fr/` with whatever is translated.
4. Run `pnpm data:check`. Every error names the file and the key path.

## Code

- `dataset.ts`: parses one version's files into indexes.
- `integrity.ts`: cross-file rules and translation coverage.
- `versions.ts`: the version registry and each version's own rules.
- `views.ts`: builds localized DTOs.
- `queries.ts`: the server functions routes call.
- `load.server.ts`: bundles `data/**` into the server build.
