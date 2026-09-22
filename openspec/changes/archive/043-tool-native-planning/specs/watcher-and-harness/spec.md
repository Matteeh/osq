# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Approval-time local planning observation
<!-- source: src/core/planning.ts, src/core/approve.ts, src/harness/types.ts, src/harness/codex-usage.ts, src/harness/opencode-usage.ts, src/harness/claude-usage.ts, tests/planning-observed.test.ts -->
`findPlanningSessions` SHALL ask every available Codex, OpenCode, and Claude
Code local reader for sessions containing at least one observed file-edit tool
call whose normalized target is within the selected change folder and whose edit
timestamp is inclusively between folder creation and observation time. Path
matching SHALL be segment-aware and reject sibling prefixes and escapes.

Each match SHALL carry harness, nullable model, observed start and end, and
independently nullable input, output, cached, and reasoning tokens and cost.
Readers SHALL degrade missing stores, unreadable or malformed records,
unsupported fields, and local read failures to no match or null without failing
approval. They SHALL inspect only metadata, usage, timestamps, tool names, and
file-path arguments required for matching and SHALL never retain transcript
content or send data off the machine.

Codex and OpenCode SHALL extend their confirmed local readers with edit-path and
window filtering. Claude Code SHALL read session JSONL below
`~/.claude/projects/` using the locally confirmed model, usage, timestamp, and
file-edit tool-call fields. No reader SHALL estimate a missing value.

#### Scenario: Supported session edits the change
- **WHEN** one local session has an in-window edit under the change and another does not
- **THEN** discovery returns exactly the matching session with observed fields and nulls for absent fields

#### Scenario: Local artifacts are unavailable
- **WHEN** stores are absent, malformed, unreadable, or contain no qualifying edit
- **THEN** discovery returns no match without changing approval success

### Requirement: Mixed-source planning lifecycle records
<!-- source: src/core/planning.ts, tests/planning-observed.test.ts -->
Observed matches SHALL be appended to `.run/plan.jsonl` as correlated existing
`PlanRecord` lifecycle pairs carrying `source: observed`. Explicit
`--session` lifecycle records SHALL carry `source: owned`, and legacy records
without source SHALL remain readable as owned.

Observed session identity SHALL be stable across repeated approval, already
recorded native sessions SHALL not be appended twice, and new records SHALL use
deterministic reader and session order. Start and exit timestamps, wall time,
usage, model, and cost SHALL come only from observed local values, with null
retained where the shape allows no observation.

#### Scenario: First approval observes a session
- **WHEN** discovery returns a native session not present in the planning log
- **THEN** one correlated observed lifecycle pair is appended with its stable identity and observed values

#### Scenario: Reapproval observes the same session
- **WHEN** the same native session is returned again
- **THEN** the append-only log remains byte-identical and planning session count is unchanged

## MODIFIED Requirements

### Requirement: Run manifest at approval
<!-- source: src/core/approve.ts, src/core/manifest.ts, src/core/planning.ts, tests/manifest.test.ts, tests/planning-observed.test.ts -->
The approve command SHALL write `.run/manifest.json` containing
content-addressed instruction, config, and capability hashes; execution
identity and timestamps; `planningSessions`, the number of valid owned and
observed `plan_started` records; and nullable `planner` attribution. An owned
start without an exit SHALL retain its established count.

`planner` SHALL use the model from the most recent observed session that reports
one, then the most recent owned `--session` record that reports one, else null.
Configuration alone SHALL never populate it. Planning logs remain below
`.run/` and SHALL NOT affect the approved content hash.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` contains content hashes, execution identity, timestamps, planning-session count, and observed planner attribution

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with valid owned and observed starts is approved
- **THEN** the manifest counts every valid start while the approved content hash remains independent of the planning log

#### Scenario: Manifest hashes are content-addressed
- **WHEN** manifest input files are hashed
- **THEN** each hash is `sha256:<hex>` from UTF-8 content or null when the file does not exist

#### Scenario: Observed and owned sessions precede approval
- **WHEN** valid observed and owned lifecycle pairs exist
- **THEN** the manifest counts both and attributes planner to the most recent reported observed model

#### Scenario: No session reports a model
- **WHEN** neither observed nor owned planning history supplies a model
- **THEN** the manifest records `planner: null` regardless of configured planner values

### Requirement: Observed-only interactive usage port
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode*.ts, src/harness/codex*.ts, tests/plan-telemetry.test.ts -->
The optional osq-owned interactive usage port SHALL continue to read the one
session created during an explicit `--session` interval and return independently
nullable token and cost fields without changing process outcome. Codex and
OpenCode implementations SHALL share their confirmed local parsing and usage
mapping with approval-time discovery while applying the caller's distinct
working-directory or edit-path and time-window predicates. AGY SHALL retain
all-null owned usage until a confirmed local artifact exists.

#### Scenario: Exact OpenCode usage
- **WHEN** exactly one matching OpenCode session row exposes usage and cost
- **THEN** the reader returns stored values with cached tokens equal to cache-read plus cache-write counters

#### Scenario: Exact Codex usage
- **WHEN** exactly one matching Codex rollout exposes cumulative thread usage
- **THEN** the reader returns input, output, cached-input, and reasoning-output counters with null cost when none is recorded

#### Scenario: AGY usage unavailable
- **WHEN** AGY completes an explicit interactive planning session
- **THEN** its reader returns null usage and cost while generic lifecycle timing remains recorded

#### Scenario: Explicit session usage is available
- **WHEN** exactly one owned interactive session exposes confirmed usage in its launch interval
- **THEN** its lifecycle record contains the existing observed token and cost mapping

#### Scenario: Usage unavailable or ambiguous
- **WHEN** no unique owned-session artifact supplies a usage field
- **THEN** that field remains null and osq performs no estimation

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/verify.ts, tests/archive-verification.test.ts, tests/plan-prompt-lifecycle.test.ts -->
Before archiving, the watcher SHALL re-run every task verification and the
change-level verification against the final tree after scope recertification.
When all gates pass, it SHALL delete root-level `plan-prompt.md`, apply deltas,
relocate the folder, project completed checkboxes, and record the archive event.
The transient prompt SHALL not participate in any archive tree hash.

#### Scenario: Archive verification passes and seals change
- **WHEN** every task verification and the change-level verify command pass against the final tree
- **THEN** the archiver removes the transient prompt, applies deltas, and relocates the change to the archive

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** the watcher records the established task regression and leaves the change and prompt unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails during archive preflight
- **THEN** the watcher records the established change regression and leaves the change and prompt unarchived

#### Scenario: Archive succeeds with a prompt file
- **WHEN** every final-tree verification passes and `plan-prompt.md` exists
- **THEN** the archived change omits the prompt while retaining authored artifacts and runtime records

#### Scenario: Archive verification fails
- **WHEN** a task or change-level final verification fails
- **THEN** the active change and its prompt remain available for diagnosis and no archive event is written
