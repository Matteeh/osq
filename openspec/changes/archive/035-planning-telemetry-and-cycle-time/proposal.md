---
title: Planning session telemetry and change cycle time
depends_on: ["034"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
---
## Goal

Make planning time and harness-reported planning usage auditable from the
filesystem, then connect that record to approval, execution, and archival so
`osq report` can show planning spend and delivery cycle time per change.

## Verify

`pnpm verify`

The automated suite uses local fixture artifacts and a fake interactive planner
that exits after a known delay. It requires no authentication, network access,
real model, or TTY.

## Non-goals

- Headless or autonomous planning, planning queues, retries, or session resume.
- Changing the interactive prompt, permissions, inherited stdio, or model selection.
- Changing task event files or estimating tokens or cost from prompts, models, or price tables.
- Importing transcripts, tool calls, or message content from harness session artifacts.
- Discovering or reverse-engineering an AGY usage store that is not part of its current adapter contract.
- Backfilling archive timestamps or planning usage for historical changes that did not record them.

## Contract

### Requirement: Append-only planning session lifecycle

Every non-print `osq plan` invocation SHALL append one `plan_started` and one
`plan_exited` record to `<change>/.run/plan.jsonl`, including invocations that
open an existing change. Both records SHALL carry a generated planning-session
identifier so pairs remain unambiguous in an append-only log.

`plan_started` SHALL be written before the interactive process is spawned and
contain the selected harness and model, selected agent when one exists, the osq
package version, and a SHA-256 hash of the exact `brief.md` bytes. `plan_exited`
SHALL contain the process exit code, non-negative wall seconds, and nullable
input, output, cached, and reasoning token counts plus nullable cost.

#### Scenario: New and resumed planning sessions
- **WHEN** interactive planning starts for a new or existing change and the process later exits
- **THEN** the change's append-only planning log contains one correlated lifecycle pair with exact identity, timing, outcome, and observed usage fields

#### Scenario: Failed planning process
- **WHEN** the interactive process cannot spawn or exits unsuccessfully
- **THEN** `plan_exited` records the non-zero outcome and elapsed wall time before existing failure propagation continues

#### Scenario: Print mode
- **WHEN** `osq plan -print` builds and emits an opening prompt without launching a process
- **THEN** no planning lifecycle record is appended

### Requirement: Observed-only interactive usage port

`HarnessAdapter` SHALL offer an optional post-session usage reader that receives
the project working directory and the observed session start and end timestamps.
It SHALL return `inputTokens`, `outputTokens`, `cachedTokens`,
`reasoningTokens`, and `cost`, with each field independently typed as a finite
number or `null`. Missing readers, missing fields, malformed artifacts, read
failures, and ambiguous session matches SHALL yield null fields and SHALL NOT
change the planner process exit result.

OpenCode SHALL read the one local session database row created for the working
directory during the observed interval, using its stored input, output,
reasoning, cache-read, cache-write, and cost columns. Codex SHALL read the one
new rollout JSONL session whose `session_meta` matches the working directory and
use the last cumulative `token_usage_record.payload.thread_token_usage` values.
Codex cost SHALL remain null because its local rollout record does not carry
cost. AGY SHALL participate in the same generic lifecycle recording and return
all-null usage because no confirmed local AGY usage artifact is in scope.
Neither reader SHALL inspect or retain transcript content.

#### Scenario: Exact OpenCode usage
- **WHEN** exactly one matching OpenCode session row exposes usage and cost
- **THEN** the exit record contains those stored values, with cached tokens equal to the harness's reported cache-read plus cache-write counters

#### Scenario: Exact Codex usage
- **WHEN** exactly one matching Codex rollout exposes cumulative thread usage
- **THEN** the exit record contains its input, output, cached-input, and reasoning-output counters and a null cost

#### Scenario: AGY planning session
- **WHEN** AGY is selected for an interactive planning session
- **THEN** the lifecycle pair records AGY identity, exit code, and wall time while every usage and cost field is null

#### Scenario: Usage unavailable or ambiguous
- **WHEN** no unique matching local artifact supplies a usage field
- **THEN** that field is null and osq performs no estimation or transcript parsing

### Requirement: Planning count in approval manifest

Approval manifest construction SHALL record `planningSessions` as the number of
valid `plan_started` records already present in `.run/plan.jsonl`. A missing or
empty planning log SHALL produce zero. Because the log lives below `.run/`, it
SHALL NOT affect approval hashing.

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with new and resumed planning sessions is approved
- **THEN** `.run/manifest.json` records their count while the approved content hash remains independent of the planning log

### Requirement: Explicit archive timestamp

After successful archive-time verification and relocation, the watcher SHALL
append one typed `archived` event to `.run/events/change.jsonl` in the archived
folder. The event timestamp is the authoritative archive time for cycle metrics
and SHALL NOT be emitted to any task event file.

#### Scenario: Successful archive
- **WHEN** a completed change is successfully moved into the archive
- **THEN** its change-level event stream contains one `archived` event timestamped after the move

#### Scenario: Blocked archive
- **WHEN** archive verification or relocation fails
- **THEN** no `archived` event is recorded

### Requirement: Planning metrics report

`osq report` SHALL expose a top-level `planning` block derived only from
`.run/plan.jsonl` across active and archived changes. It SHALL include session
count, total wall seconds, wall seconds grouped by change, aggregate input,
output, cached, and reasoning tokens, aggregate harness-reported cost, and
numeric usage coverage. A session counts as covered when at least one token or
cost field in its matched `plan_exited` record is a finite harness-reported
number, including zero.

Text output SHALL render the exact phrase
`n of m sessions reported usage`. Null usage values contribute nothing to sums
and SHALL remain distinguishable from observed zero values in the source log.

#### Scenario: Mixed planning usage coverage
- **WHEN** planning logs contain sessions with complete, partial, and unavailable usage
- **THEN** report totals only finite recorded values and coverage counts each session with any reported usage once

#### Scenario: Per-change planning wall time
- **WHEN** planning sessions exist for more than one change
- **THEN** JSON and text output show total wall time and deterministic per-change wall-time sums

### Requirement: Archived change cycle metrics

`osq report` SHALL expose a top-level `cycle` block with one deterministically
ordered JSON row for every archived change. Each row SHALL contain the change
identifier and nullable seconds for brief date to manifest `approvedAt`,
`approvedAt` to the earliest task `started` event, earliest task `started` to
the change-level `archived` event, and the total of all three phases.

The brief date SHALL be parsed from `brief.md` frontmatter using standard ISO
date semantics. Each phase SHALL be null when either endpoint is missing,
invalid, or precedes its start; total SHALL be null unless all phases are
present. Phase aggregates SHALL report total, average, and `n of m archived
changes` coverage. Text output SHALL show only these aggregate lines; per-change
cycle rows SHALL remain in JSON.

#### Scenario: Complete archived lifecycle
- **WHEN** an archived change has valid brief, approval, first-start, and archive timestamps
- **THEN** all three non-negative phase durations and their sum appear in its JSON row and contribute to aggregate lines

#### Scenario: Historical change lacks timestamps
- **WHEN** an archived change predates one or more lifecycle records
- **THEN** its row retains null for unavailable phases and totals without filesystem-time inference or backfill

### Requirement: Planning sessions in change inspection

`osq show <id>` SHALL read `.run/plan.jsonl`, correlate lifecycle records by
planning-session identifier, and list sessions in start order with harness,
model, start time, exit code, and wall seconds. Missing or malformed planning
logs SHALL not prevent the remaining change details from rendering.

#### Scenario: Inspecting repeated planning
- **WHEN** a change has more than one planning lifecycle pair
- **THEN** show output lists every session and its recorded wall time before the task event timeline

## Local artifact confirmation

Checked on 2026-09-21 before adapter work was planned:

- OpenCode 1.18.31 stores sessions in
  `~/.local/share/opencode/opencode.db`. Its `session` table carries exact
  `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`,
  `tokens_cache_write`, and `cost` values together with directory and creation
  timestamps.
- Codex CLI 0.155.1 stores rollout JSONL below
  `~/.codex/sessions/YYYY/MM/DD/`. `session_meta` carries the working directory
  and session timestamp; `token_usage_record.payload.thread_token_usage`
  carries cumulative input, output, cached-input, and reasoning-output tokens.
  The inspected records carry no cost field.
- AGY remains a supported planner through its existing interactive adapter, but
  this change has no confirmed AGY local usage artifact contract. Its timing is
  still exact and its five usage fields are explicitly null.

Readers remain defensive because these are harness-owned artifacts. Tests use
fixtures with the observed shapes rather than a live harness.

## Human steps

- Finish and archive dependency 034 before approving or executing this change.
- Review the parent contract, capability deltas, and task titles. Task bodies are intentionally deferred until the list is approved.
- After task bodies are written, run `pnpm osq approve 035` yourself. Neither planner nor executor approves the change.
- After implementation, optionally run one real planning session with each configured harness; compare OpenCode and Codex values with their native usage displays and confirm AGY records exact timing with null usage.

## Delta

- `specs/cli-foundation/spec.md`: append-only planning lifecycle records and print/resume behavior.
- `specs/watcher-and-harness/spec.md`: observed-only usage adapter port, planning count in manifests, and authoritative archive timestamps.
- `specs/metrics-and-reporting/spec.md`: planning aggregation, usage coverage, and archived change cycle metrics.
- `specs/status-inspection/spec.md`: planning-session display in `osq show`.
