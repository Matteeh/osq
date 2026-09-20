# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/init.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and `src/core/init.ts` SHALL encode slicing, detail, file tool, and change-level verify rules.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires task verify commands to exercise complete slices through real entry points, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires file tool usage, and mandates change-level verify immediately following the goal

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts`
