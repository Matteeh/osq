---
title: "Planner rules and documentation: task slicing, acceptance detail, template alignment, and instruction-shaped delta linting"
depends_on:
  - "029"
verify: "pnpm verify"
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

Codify refined planning discipline into `PLANNER.md` and enforce delta specification purity across the engine:

1. **Planner Rules Codification**:
   - **Slicing**: Every task's `verify` exercises its slice through the real entry point, wiring included. If closing the loop requires a file outside the task's scope, the scope is wrong; widen it or merge the task. An executor result that says "outside this task's scope" is a planning failure and archive-time verification catches it.
   - **Detail**: Task bodies carry acceptance lines and the names of existing code to reuse. No `## Signatures` blocks, no numbered implementation steps, no line numbers. Full signatures are written only for ports.
   - **Files**: Written with the file tool, never through a shell echo.
   - **Change-level verify**: Every proposal declares one, and it is the first thing written after the goal.

2. **Scaffolding and Template Synchronization**:
   - `templates/PLANNER.md` and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts` updated to match `PLANNER.md` byte-for-byte between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`.
   - The automated byte-equality test in `tests/init-planner.test.ts` ensures `PLANNER.md`, `MANAGED_PLANNER_BLOCK`, and `templates/PLANNER.md` remain identical.

3. **Instruction-Shaped Delta Linting**:
   - `osq lint` and `osq approve` reject any change folder containing instruction-shaped deltas (specifically requirement names or headings using imperative verbs such as "update" or "document").
   - Pulled forward because the removal of legacy prose appender `applyDelta` in 028 eliminates tolerance for instruction-shaped text in living specs.

## Verify

`pnpm verify`

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Repository `PLANNER.md` | Contains updated slicing, detail, file tool, and change-level verify instructions within the managed markers |
| Managed block in `src/core/init.ts` | `MANAGED_PLANNER_BLOCK` matches `PLANNER.md` managed content byte-for-byte |
| Template `templates/PLANNER.md` | Matches the managed planner block and is verified by automated byte-equality tests |
| Delta requirement starting with "Update" | `osq lint` and `osq approve` fail reporting an error that deltas must declare living capability behavior rather than imperative instructions ("update") |
| Delta requirement starting with "Document" | `osq lint` and `osq approve` fail reporting an error that deltas must declare living capability behavior rather than imperative instructions ("document") |
| Declarative requirement deltas | Valid declarative requirements (e.g. `### Requirement: ...` with system assertions) pass linting cleanly |

### Requirements and Scenarios

#### Requirement: Planner protocol rules in documentation and templates
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and `src/core/init.ts` SHALL encode slicing, detail, file tool, and change-level verify rules.
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires task verify commands to exercise complete slices through real entry points, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires file tool usage, and mandates change-level verify immediately following the goal

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts`

#### Requirement: Instruction-shaped delta rejection in linter
The linter SHALL inspect delta specifications under `specs/` in change folders and reject any requirement whose name or heading is instruction-shaped (such as starting with "update" or "document").
- **WHEN** a delta specification contains a requirement starting with "update" or "document" (case-insensitive)
- **THEN** `osq lint` and `osq approve` reject the change folder with a validation error

#### Scenario: Declarative capability deltas pass lint
- **WHEN** all delta specifications declare behavior using declarative requirements
- **THEN** instruction-shaped delta validation passes with zero errors

## Non-goals

- Altering the deterministic delta merge algorithm in `src/core/delta.ts`.
- Restricting language inside task descriptions or proposal goals (the rule applies specifically to capability delta specifications).

## Human steps

None.

## Delta

This change adds slicing, detail, and change-level verify rules to the managed planner protocol in `cli-foundation` and enforces byte-equality across templates; and adds instruction-shaped delta rejection ("update", "document") to `spec-lint-and-approve`.
