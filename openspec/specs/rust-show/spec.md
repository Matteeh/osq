# rust-show Specification

## Purpose
The show feature prints one change's details as TypeScript's `osq show` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/show/** -->
The rust-show capability SHALL own the `osq-feature-show` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Show crate ownership
- **WHEN** file ownership is resolved for the show feature
- **THEN** system maps `crates/features/show/**` to rust-show

### Requirement: Show command
`osq-feature-show` SHALL expose one public item, `ShowFeature`, a unit
struct that implements core's `Feature`. Its `name()` is `show`. Its
`commands()` is one `Command` named `show`, with the summary `show detailed
change information, tasks, and event timeline` and the usage `<id>`. `run`
refuses every other command with `FeatureError::unknown_command` naming the
invocation's command. The crate depends on no other feature crate.

#### Scenario: Show feature commands
- **WHEN** a test asks `ShowFeature` for its name and commands, and runs it with the command `inbox` and no arguments on a scratch project root
- **THEN** its name is `show`, it lists exactly the one `show` command with that summary and usage, and the run returns `FeatureError::unknown_command` displaying as `unknown command: inbox`

### Requirement: Show arguments
Before it reads any file, `show` SHALL take exactly one argument as the
change id. With no argument or more than one, it fails with
`FeatureError::usage("show", "expected <id>")`. An id that is empty after
trimming fails with `FeatureError::usage("show", "specify a spec ID to show
(e.g. osq show 001)")`, TypeScript's text after its `Error: ` prefix.

#### Scenario: Show argument errors
- **WHEN** a test runs `show` with the row's arguments on a root that holds no `openspec/` folder
- **THEN** it gives the row's `Usage` error, displayed as the row's text:

| Arguments | Text |
|---|---|
| none | `usage of show: expected <id>` |
| `1`, `2` | `usage of show: expected <id>` |
| two spaces | `usage of show: specify a spec ID to show (e.g. osq show 001)` |

### Requirement: Show lookup
`show` SHALL find the change as TypeScript's `resolveSpecFolder` does with
vcs off. A trimmed id holding `/` that names a directory, absolute or
under the root, is that folder, archived or rejected by its parent folder.
Any other id is the first change in `list_changes` order whose folder name
equals the trimmed id or its number padded to three digits, starts with
either and `-`, or ends with `-` and the trimmed id.

#### Scenario: Show lookup forms
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's first line is the golden's first line

### Requirement: Show lookup errors
When nothing matches, `show` SHALL fail with `FeatureError::failed("show",
..)` and the text `Spec "<id>" not found in specs or archive`, `<id>` as
given. A found folder without `proposal.md` fails with the text `Neither
proposal.md nor spec.md found in <folder>`, `<folder>` the root joined with
the folder's path. These are TypeScript's texts after its `Show error: `
prefix.

#### Scenario: Show errors equal TypeScript's
- **WHEN** a test runs `show` with the row's argument on a scratch copy of `tests/fixtures/show-project`
- **THEN** it gives the `Failed` error whose message equals the row's golden in `tests/fixtures/golden/` with its `Show error: ` prefix and final newline removed and `<root>` replaced by the scratch root:

| Argument | Golden |
|---|---|
| `999` | `unknown-999.err.txt` |
| `012` | `no-proposal-012.err.txt` |

### Requirement: Show text
`show` SHALL return `Output::text` holding TypeScript's `formatShowText`
for the found change and one newline, as `osq show <id>` prints it with
vcs off. Event data values print as JavaScript's `String()` prints them,
keys in file order. The goldens in `tests/fixtures/golden/` are
TypeScript's output for `tests/fixtures/show-project`, printed by
`print-goldens.mjs.txt` beside them, which also writes the
`.run/running/1.pid` marker of `003-running` that git does not keep.

#### Scenario: Show text equals TypeScript's
- **WHEN** a test runs `show` with the row's argument on a scratch copy of `tests/fixtures/show-project`
- **THEN** the output text equals the row's golden in `tests/fixtures/golden/`, byte for byte:

| Argument | Golden |
|---|---|
| `1` | `active-001.txt` |
| `approved` | `approved-002.txt` |
| `003` | `running-003.txt` |
| `004-dead` | `dead-004.txt` |
| `5` | `steering-005.txt` |
| `006` | `blocked-006.txt` |
| `007` | `unplanned-007.txt` |
| `10` | `archived-010.txt` |
| `openspec/changes/archive/010-archived` | `archived-010.txt` |
| `011` | `rejected-011.txt` |

#### Scenario: Show outline
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's outline equals its golden's outline, and for the arguments `5` and `006` the whole output equals the golden. The outline of a text is its lines before the line `Planning Sessions:`, without the `Verification:` and `Validation:` blocks (each heading line and the lines after it that start with a space) and without the run lines: lines that start, after their indent, with `Pre-spawn verify:`, `Retries:`, `Stuck:`, `Focused runs:`, `Mutation:`, `Survived:`, `Dependencies added:`, `Instructions changed after approval:` or `Disclosures:`

#### Scenario: Show run history
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's `Tasks:` and `Event Timeline:` sections equal its golden's, and for the arguments `approved`, `003` and `004-dead` the whole output equals the golden. A section is its heading line and the lines after it that start with a space

#### Scenario: Show approval digest
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's `Planning Sessions:` section (its heading line and the lines after it that start with a space) equals its golden's; for the arguments `1` and `007` the digest without its flag lines equals the golden's; and for the argument `011` the whole output equals the golden. The digest is the text from its line that starts with `Change: ` to the end, and its flag lines are the lines that start with `Flag: `

#### Scenario: Show digest flags
- **WHEN** a test runs `show` with the arguments `1` and `007` on a scratch copy of the fixture
- **THEN** each whole output equals its golden

#### Scenario: Show archived change
- **WHEN** a test runs `show` with the arguments `10` and `openspec/changes/archive/010-archived` on a scratch copy of the fixture
- **THEN** each whole output equals `archived-010.txt`

### Requirement: Show status and next step
`show` SHALL print the `Status:` line, the `Next:` line and each task's
status as TypeScript does with vcs off. An archived change is `done` and
`landed`, or `dead (needs steering) — osq plan <id>` when its markers hold
a steering trigger; a rejected change prints no `Next:` line. An active
change follows `readActiveNextStep` without the planner, auto-steer and
pause records: `unplanned`, `ready for approval`, `dead (needs steering)`,
`dead` with a retry command, `blocked`, then `running`.

#### Scenario: Status and next step from markers
- **WHEN** a test runs `show 1` on a scratch root holding only the files `golden/print-status-table.mjs.txt` in the change folder writes for the row: `openspec/changes/001-a/proposal.md` titled `A works` with the row's frontmatter, its `tasks/1.md` titled `When a runs, it works`, and the row's other files, paths relative to the change folder
- **THEN** the output's `Status:` line, `Next:` line and first task line, trimmed, are the row's:

| Row | Status | Next | Task line |
|---|---|---|---|
| unapproved | `Status: [unapproved]` | `Next: ready for approval — osq approve 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, no verify | `Status: [unapproved]` | `Next: unplanned — osq lint 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, sentinel verify | `Status: [unapproved]` | `Next: unplanned — osq lint 001` | `[ ] 1. When a runs, it works [pending]` |
| unapproved, sentinel verify, brief | `Status: [unapproved]` | `Next: unplanned — osq plan 001` | `[ ] 1. When a runs, it works [pending]` |
| approved | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| approved, done 1 | `Status: [done]` | `Next: running — osq show 001` | `[x] 1. When a runs, it works [done]` |
| approved, running 1 | `Status: [running]` | `Next: running — osq show 001` | `[>] 1. When a runs, it works [running]` |
| dead verify_red | `Status: [dead]` | `Next: dead — osq retry 001 1` | `[!] 1. When a runs, it works [dead] (reason: verify_red)` |
| dead blocked | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: blocked)` |
| dead entry_missing | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: entry_missing)` |
| dead stuck | `Status: [dead]` | `Next: dead (needs steering) — osq plan 001` | `[!] 1. When a runs, it works [dead] (reason: crashed)` |
| dead blocked, done 1 | `Status: [dead]` | `Next: running — osq show 001` | `[!] 1. When a runs, it works [dead] (reason: blocked)` |
| regressed 1 scope_regression passed | `Status: [regressed]` | `Next: dead — osq retry 001 1` | `[ ] 1. When a runs, it works [regressed]` |
| regressed 1 scope_regression | `Status: [regressed]` | `Next: dead (needs steering) — osq plan 001` | `[ ] 1. When a runs, it works [regressed]` |
| regressed change sync_conflict | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change requirement_changed | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change verify_red | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change verify_path_missing | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change sync_verify_red | `Status: [done]` | `Next: dead (needs steering) — osq plan 001` | `[x] 1. When a runs, it works [done]` |
| regressed change other | `Status: [done]` | `Next: dead — osq retry 001 change` | `[x] 1. When a runs, it works [done]` |

### Requirement: Show dependency readiness
A dependency of an approved active change SHALL count as met, as
TypeScript's `isDependencyDone` says, when its number padded to three
digits names an archived change, or an active change whose every task file
has a done marker. A rejected change, a missing one and an active one
without task files never count as met, and an unmet dependency makes the
change `blocked`.

#### Scenario: Dependency readiness from folders
- **WHEN** a test runs `show 1` on a scratch root built as "Status and next step from markers" says, for the row
- **THEN** the output's `Status:` line, `Next:` line and first task line, trimmed, are the row's:

| Row | Status | Next | Task line |
|---|---|---|---|
| depends 002 missing | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 2 archived | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 rejected | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active unfinished | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active done | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active no tasks | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
