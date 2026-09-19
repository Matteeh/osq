# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Prohibited control characters rejection
<!-- source: src/core/linter.ts, tests/mangled-lint.test.ts -->
The linter and approval engine SHALL inspect all files in a change folder and reject any file containing prohibited ASCII control characters (0x00-0x1F and 0x7F) other than newline (`\n`, 0x0A) and tab (`\t`, 0x09).

#### Scenario: Control characters trigger lint and approval failure
- **WHEN** any file in a change folder contains prohibited control characters (e.g. `\x07` bell or `\x08` backspace)
- **THEN** `osq lint` and `osq approve` fail reporting an error identifying the file and character

#### Scenario: Allowed whitespace passes
- **WHEN** files contain only valid printable characters, newlines (`\n`), and tabs (`\t`)
- **THEN** control character validation passes

### Requirement: Fused acceptance lines rejection
<!-- source: src/core/linter.ts, tests/mangled-lint.test.ts -->
The linter SHALL reject any task file where two or more acceptance checkbox checklist items appear on the same line.

#### Scenario: Fused acceptance lines trigger lint error
- **WHEN** a line in a task file contains more than one acceptance checkbox pattern (`[-*]\s*\[[ xX]\]`)
- **THEN** `osq lint` and `osq approve` reject the task file reporting fused acceptance lines

#### Scenario: Separate acceptance lines pass
- **WHEN** every acceptance checklist item appears on its own line
- **THEN** acceptance line structure validation passes

### Requirement: Dead marker retention and renaming on approval
<!-- source: src/core/approve.ts, tests/dead-marker-retention.test.ts -->
When `osq approve` is executed on a change folder containing active dead markers (`.run/dead/<n>.md`), the approval engine SHALL rename each dead marker to `.run/dead/<n>.<attempt>.md`, where `<attempt>` is derived from existing attempts, preserving prior failure diagnostics.

#### Scenario: First failure preserved on re-approval
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` without prior attempt markers
- **THEN** `dead/1.md` is renamed to `dead/1.1.md`

#### Scenario: Subsequent failures increment attempt number
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` and existing `dead/1.1.md`
- **THEN** `dead/1.md` is renamed to `dead/1.2.md`

### Requirement: Task title phrasing permissiveness
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL permit task titles containing " and " without emitting a warning.

#### Scenario: Task title containing and emits no warning
- **WHEN** a task declares a title containing " and "
- **THEN** `osq lint` produces zero warnings for the title
