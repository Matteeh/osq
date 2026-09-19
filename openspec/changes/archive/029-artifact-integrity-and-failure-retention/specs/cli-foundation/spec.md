# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Manual task completion command
<!-- source: src/cli/done.ts, src/core/done.ts, src/cli/index.ts, tests/done-manual.test.ts -->
The CLI SHALL provide `osq done <id> <n> --manual "<reason>"` allowing a human to mark a task done with required justification, writing a frontmatter-annotated marker and event.

#### Scenario: Executing osq done with reason
- **WHEN** user runs `osq done <id> <n> --manual "<reason>"`
- **THEN** system writes `.run/done/<n>` with frontmatter declaring `manual: true` and `reason`, and appends `done_manual` event

#### Scenario: Missing manual flag fails command
- **WHEN** user runs `osq done <id> <n>` without `--manual`
- **THEN** command exits non-zero and refuses to mark the task done

### Requirement: Hand-placed done marker detection in doctor
<!-- source: src/core/doctor.ts, tests/doctor.test.ts -->
The `osq doctor` command SHALL inspect all `.run/done/` markers across active change folders and fail if any marker lacks valid frontmatter.

#### Scenario: Hand-placed done marker reported as failure
- **WHEN** a done marker in an active change folder lacks valid automated (`scope_hash`) or manual (`manual: true`) frontmatter
- **THEN** `osq doctor` reports a failure identifying the invalid hand-placed marker

#### Scenario: Legitimate done markers pass
- **WHEN** all done markers possess valid automated or manual frontmatter
- **THEN** doctor done-markers check reports ok

### Requirement: Planner file tool protocol instruction
<!-- source: src/core/init.ts, PLANNER.md, tests/init-planner.test.ts -->
The managed planner instructions block in `PLANNER.md` and `src/core/init.ts` SHALL instruct planners to write files using the file tool rather than shell echo.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write files with the file tool, never through a shell echo.`
