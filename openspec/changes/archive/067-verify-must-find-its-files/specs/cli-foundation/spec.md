# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planner verify start guidance
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/foundation/init-blocks.ts, README.md, tests/verify-starts-docs.test.ts -->
The managed planner block SHALL state that a task whose verify names a test it
creates declares `verify_starts: red`, that a new test file may share a verify
with existing tests, and that `any` is only for a task that can honestly start
either way. README SHALL name the `verify_path_missing` dead reason among the
automatic retry reasons and the dead reasons, and the `verify_starts_conflict`
approval flag.

#### Scenario: Planner block guidance
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it states the `red` rule for a task that creates the test its verify names, allows a new test next to existing ones in one verify, and limits `any` to honest either-way starts

#### Scenario: README names the new reason and flag
- **WHEN** README is inspected
- **THEN** `verify_path_missing` appears in the automatic retry bullet and the dead reasons list, and `verify_starts_conflict` appears with the approval flags
