# Architecture Decision Records

Lightweight ADRs capturing the non-obvious architectural decisions encoded
in [`docs/rules/BACKEND_RULES.md`](../rules/BACKEND_RULES.md) and
[`docs/rules/FRONTEND_RULES.md`](../rules/FRONTEND_RULES.md). Each one
documents the context, the decision, and the alternatives that were passed
over — not every rule needs one, only the ones where a different call was
genuinely on the table. Major project-specific decisions get one too (see "Decision Records" in
[`AGENTS.md`](../../AGENTS.md)).

| # | Title | Status | Adversarial review |
|---|---|---|---|
| [0001](0001-game-data-as-json-in-repo.md) | Game data as JSON files in the repository | Accepted | Not yet |
| [0002](0002-independent-tree-per-game-version.md) | One independent data tree and schema per game version | Accepted | Not yet |
| [0003](0003-one-file-per-look.md) | One file per look, with its NPCs inside | Accepted | Not yet |
| [0004](0004-facts-and-per-locale-text-files.md) | Facts and text in separate, per-locale files | Accepted | Not yet |
| [0005](0005-server-side-localized-data-access.md) | Data is read only on the server, already localized | Accepted | Not yet |
| [0006](0006-retail-import-petopia-facts.md) | Retail import from Petopia facts plus game data, with a non-destructive merge | Accepted | Not yet |