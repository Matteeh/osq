## ADDED Requirements

### Requirement: Emitted verify_ran event exit code and duration
<!-- source: src/harness/types.ts, src/watcher/verify.ts, src/watcher/runner.ts -->
The runner and verification gate SHALL emit `verify_ran` events carrying `exitCode` and `duration` across all task and archive verification executions through a single code path.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, and wall-clock `duration` in seconds

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, and elapsed `duration` in seconds

#### Scenario: Single verification event emission path
- **WHEN** any verification gate executes
- **THEN** exactly one code path in the verification subsystem measures duration, captures process exit status, and records the `verify_ran` event

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/watcher/regression.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising the post-task content-addressed hash of the task scope, the active build stamp, and the verification exit code.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` is written with YAML frontmatter containing `scope_hash`, `build_stamp`, and `exit_code: 0`, followed by the ISO timestamp

#### Scenario: Scope hash stability across task completions
- **WHEN** scoped files are fingerprinted at task completion
- **THEN** `scope_hash` is computed deterministically from the sorted scoped file paths and their UTF-8 content SHA-256 digests

### Requirement: Pre-spawn scope comparison and regression detection
<!-- source: src/watcher/regression.ts, src/watcher/runner.ts -->
Before spawning task n+1, the runner SHALL verify all earlier completed tasks' recorded scope hashes against the current working tree, detecting regressions prior to process spawn.

#### Scenario: Pre-spawn scope hash comparison passes
- **WHEN** all files belonging to earlier done tasks scopes retain their recorded hashes in the current tree
- **THEN** runner proceeds to spawn task n+1

#### Scenario: Scope regression detected prior to task spawn
- **WHEN** any scoped file of an earlier completed task has been altered or deleted in the current tree
- **THEN** runner refuses to spawn task n+1, writes `.run/regressed/<earlierTask>.md` listing differing paths, appends a `regressed` event, and halts execution

### Requirement: Regressed marker, event, and status lifecycle
<!-- source: src/core/layout.ts, src/core/state.ts, src/core/status.ts, src/watcher/outcome.ts, src/harness/types.ts -->
The engine SHALL record regression failures under `.run/regressed/`, emit typed `regressed` events to event streams, and reflect `regressed` state across spec derivation and status overview inspection.

#### Scenario: Regressed marker content and differing paths
- **WHEN** a regression is detected
- **THEN** engine writes `.run/regressed/<n>.md` (or `.run/regressed/change.md`) containing the failure reason, exit code, command, output, or differing paths

#### Scenario: Regressed event emission
- **WHEN** a regressed marker is written
- **THEN** engine appends a `regressed` event to `.run/events/<target>.jsonl` carrying `exitCode` and `duration`

#### Scenario: Status command formats regressed task and change
- **WHEN** `osq status` inspects a change with regressed tasks or change-level regression
- **THEN** status output displays `[!] <task>. <title> [regressed]` and marks the spec overview as `[regressed]`

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/verify.ts -->
Before archiving a completed change, the archiver SHALL re-run every task's verification command followed by the proposal's change-level verification command against the final working tree under the runner timeout and TTY-free environment.

#### Scenario: Archive verification passes and seals change
- **WHEN** all task verification commands and the change-level verify command exit with code 0 against the final tree
- **THEN** archiver applies deltas and relocates the change folder to `openspec/changes/archive/`

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** archiver halts, writes `.run/regressed/<n>.md`, appends a `regressed` event to `.run/events/<n>.jsonl`, and leaves the change unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails during archive preflight
- **THEN** archiver halts, writes `.run/regressed/change.md`, appends a `regressed` event to `.run/events/change.jsonl`, and leaves the change unarchived
