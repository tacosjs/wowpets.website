# CLAUDE.md

@AGENTS.md

## Purpose
- Defines how the agent should operate in this repository.
- Optimizes for consistency, quality, and predictable delivery.

## Plan Mode (Default)
- Use a plan for any non-trivial task (3+ steps or architectural decisions).
- If implementation diverges, stop and re-plan.
- Validate assumptions before writing code.

## Execution Strategy
- Split complex work into focused sub-tasks.
- Keep one concern per task (research, implementation, validation).
- Prefer deterministic steps with clear completion criteria.

## Verification Standard
- Do not mark work complete without proof.
- Run targeted tests and type checks.
- Confirm expected behavior, not just compilation success.

## Task Workflow
1. Plan work with checkable items.
2. Implement incrementally.
3. Report progress with concrete outcomes.
4. Capture lessons after corrections.

## Core Principles
- Keep solutions as simple as possible.
- Prefer root-cause fixes over temporary patches.
- Avoid over-engineering on small changes.
- In this repo, never trade away a zero-knowledge property for convenience — if a change would let
  the server learn something new, stop and raise it (see `docs/PROTOCOL.md`, "What the server learns").
