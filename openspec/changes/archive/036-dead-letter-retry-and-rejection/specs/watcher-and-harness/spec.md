# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Preserving retry transition
<!-- source: src/core/retry.ts, src/core/layout.ts, src/watcher/**, tests/retry*.test.ts -->
Retry SHALL be the sole transition that retires an active dead or regressed
marker. It SHALL rename rather than delete the active marker, using the next
target-wide ordinal across retained dead and regressed failures. A task-level
regression SHALL also preserve its active done marker under an inactive
attempt-suffixed name so the retried task derives as pending. A change-level
retry SHALL accept the literal target `change` and make archive verification
eligible to run again.

#### Scenario: Dead marker retained
- **WHEN** a task's first active dead marker is retried
- **THEN** `dead/<n>.md` becomes `dead/<n>.1.md` and the task becomes pending without deleting diagnostics

#### Scenario: Regressed completion retained
- **WHEN** a regressed numeric task has an active done marker
- **THEN** retry retains both failure and completion markers under inactive attempt names before the task runs again

#### Scenario: Change regression retained
- **WHEN** the change target is retried
- **THEN** `regressed/change.md` becomes its next attempt-suffixed historical marker

### Requirement: Retry attempt lifecycle events
<!-- source: src/harness/types.ts, src/core/retry.ts, src/watcher/spawn.ts, tests/retry*.test.ts, tests/golden-events.test.ts -->
The lifecycle event union SHALL include a typed `retry` event carrying target,
reason, and next execution attempt. Every newly emitted `started` event SHALL
carry its execution attempt. Initial execution is attempt 1, and the first
start after retry SHALL match the attempt in the preceding retry event. Legacy
started events without attempt SHALL remain readable.

#### Scenario: Initial attempt
- **WHEN** the runner spawns a task without retained failure history
- **THEN** its started event contains `attempt: 1`

#### Scenario: Retried attempt
- **WHEN** retry records the next attempt and the watcher later spawns the task
- **THEN** the target event stream contains retry followed by started with the same attempt

### Requirement: Retried executor context
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode.ts, src/harness/codex-prompt.ts, src/watcher/spawn.ts, tests/harness-prompt-injection.test.ts -->
The runner SHALL reconstruct retry context from append-only state and pass the
attempt and failure reason through shared spawn options. Every textual harness
prompt SHALL identify the prior failure reason and the existing prior result
file in one prior-context section. Retry SHALL NOT remove the result before
spawn.

#### Scenario: Fresh process receives retry context
- **WHEN** the watcher restarts after retry and then spawns the target
- **THEN** the executor prompt identifies the retry attempt, retained failure reason, and prior result path

### Requirement: Rejection lifecycle record
<!-- source: src/core/reject.ts, src/harness/types.ts, tests/reject.test.ts -->
A successful rejection SHALL write `.run/rejected.md` in the moved folder and
append one typed `rejected` event to `.run/events/change.jsonl`. Both artifacts
SHALL record the same non-empty reason and ISO timestamp while all pre-existing
events and run artifacts remain intact.

#### Scenario: Rejection is recorded after relocation
- **WHEN** an eligible change moves to the rejected directory
- **THEN** its destination contains a matching rejection marker and change-level event after all previous event bytes

## MODIFIED Requirements

### Requirement: Marker retention under run directory
<!-- source: src/watcher/runner.ts, src/core/retry.ts, tests/dead-marker-retention.test.ts, tests/retry*.test.ts -->
The task runner, watcher loop, and approval command SHALL NOT delete, rename, or
otherwise retire active or historical failure markers under `.run/`. Only an
explicit successful retry may rename active dead, regressed, and associated
done markers into attempt-suffixed history. Successful reruns SHALL write new
active done markers without removing historical diagnostics.

#### Scenario: Successful task run leaves prior dead markers untouched
- **WHEN** a retried task with attempt-suffixed failure markers completes successfully
- **THEN** runner writes `.run/done/<n>` without removing or rewriting historical markers

#### Scenario: Approval leaves failure active
- **WHEN** a failed change is reapproved after authored edits
- **THEN** watcher still observes the active failure until explicit retry

### Requirement: Typed event hygiene and single emission path
<!-- source: src/harness/types.ts, src/core/summary.ts, src/core/retry.ts, src/core/reject.ts, src/harness/opencode.ts, src/harness/agy.ts, src/watcher/spawn.ts -->
The harness and watcher SHALL record lifecycle, retry, rejection, and tool
events using a typed discriminated union, with tool summaries relativized to
the project root at write time and a single code path for each event type.
Every new started event SHALL include build identity and execution attempt.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, `osqVersion`, and `attempt` under event data

#### Scenario: Retry and rejection event typing
- **WHEN** retry or rejection succeeds
- **THEN** its event is appended through the shared event writer with the payload defined for that discriminant

#### Scenario: Write-time tool summary relativization
- **WHEN** an agent executes a tool call targeting workspace files
- **THEN** harness relativizes absolute project paths in the tool summary relative to the project root before writing to `events.jsonl`

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, agent harnesses, adapter registration, execution manifest
construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, `src/core/manifest.ts`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness
