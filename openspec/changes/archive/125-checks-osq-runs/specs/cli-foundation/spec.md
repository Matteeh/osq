## ADDED Requirements

### Requirement: Command error streams
`runCli` SHALL catch a `CommandError`, print a non-empty message to stderr,
then print `Next: <next>` to stdout when `next` is set, and set
`process.exitCode` to its `exitCode` without ending the process. Any error
that is neither a `CommandError` nor a `ConfigLoadError` SHALL propagate from
`runCli` as before. Every command SHALL print the same text on the same
streams, in the same order, and exit with the same code as before.

#### Scenario: Refusal on the command line
- **WHEN** `osq show 999` runs in a project without change 999
- **THEN** stderr holds exactly `Show error: Spec "999" not found in specs or archive`, stdout is empty, the exit code is 1, and `process.exit` is never called

### Requirement: No command records a verification
osq SHALL register no `check` and no `verified` command. A check osq can run
is a proposal's `check:` command, which the watcher runs at archive and
`osq land` runs in its sync. A step osq cannot run is an after-landing note,
and no command records that a human did it.

#### Scenario: Removed commands
- **WHEN** `createProgram` builds the CLI
- **THEN** it has no `check` and no `verified` command

## MODIFIED Requirements

### Requirement: Planner human steps guidance
The planner block and osq schema SHALL tell planners to split `## Human steps`
into `### Before approval` and `### After landing`, with steps during the run
under Before approval. They SHALL say that after-landing steps are notes that
nothing waits on, and that a check osq can run goes in `check: <command>` in
the proposal frontmatter, which osq runs after the change-level verify at
archive and again when `osq land` merges a newer default branch. Neither
SHALL name `osq verified`.

#### Scenario: Planner block names the subsections
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names `### Before approval`, `### After landing`, and `check: <command>`, and does not contain `osq verified`

## REMOVED Requirements

### Requirement: Check command
**Reason**: A check runs as part of archive and land, so there is nothing left to run by hand after landing.
**Migration**: Put the command in the proposal's `check:` frontmatter. The watcher runs it after the change-level verify at archive, and `osq land` runs it again when it merges a newer default branch.

### Requirement: Verified command
**Reason**: It recorded a human's claim that osq cannot check (ADR 006 decision 3), and in this repository it was used twice in 107 changes.
**Migration**: None. After-landing steps are notes, and nothing waits on them.

### Requirement: Command error output
**Reason**: Its `Failed check` scenario described `osq check`, which is removed. The rest of the rule carries on as "Command error streams".
**Migration**: None.
