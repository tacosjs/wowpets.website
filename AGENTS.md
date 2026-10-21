# AGENTS.md

## Scope
- Applies to this folder and descendants.
- Overrides or extends root-level agent policies when necessary.
- Detailed rules live in [`docs/rules/`](docs/rules/): read the relevant file before touching
  backend, frontend, or board workflow. They're written to be reused as-is by projects
  bootstrapped from this kit; anything project-specific belongs in the profile below.

## Project profile
Per-project choices the generic rules refer to. A project created from this kit edits this table
and nothing in `docs/rules/`.

| Setting | This repository |
|---|---|
| Package manager (JS) | pnpm |
| Frontend stack | React 19, Vite, TanStack Router (file-based), TanStack Query |
| UI kit | Tailwind CSS (no component kit) |
| Locales | `en` (base), `fr` — Paraglide JS (`project.inlang/`, `messages/`) |
| Test stack | Vitest + Testing Library, xUnit v3 |

## Local Rules
- Respect module boundaries in this directory.
- Keep changes small and focused.
- Use existing patterns before introducing new abstractions.
- Any change to the wire protocol or crypto touches both languages, `spec/` vectors and
  `docs/PROTOCOL.md` in the same change.

## Required Validation
- Run unit tests for touched logic (`pnpm test`, `pnpm test:server`).
- Run type checks for affected packages (`pnpm typecheck`).
- Run `pnpm test:e2e` when the client, server, or wire contract changes.
- Verify user-visible behavior with concrete examples.

## Coding Standards
- Use descriptive naming and object parameters for app-owned functions.
- Add short, useful comments only where intent is non-obvious.
- Keep functions cohesive and easy to reason about.

## Handoff Notes
- Summarize what changed.
- List validation commands executed.
- Record follow-up tasks if scope was intentionally deferred.
