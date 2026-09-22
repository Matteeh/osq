---
title: Tool-native planning
depends_on: ["040"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
---
## Goal

Let authors plan in the editor extension or agent tool they already use while
osq supplies the complete local context, write boundary, lint gate, and durable
record. Make prompt handoff the default, retain the existing osq-owned
interactive session as an explicit opt-in, and observe local planning sessions
at the human approval gate without estimating or sending data off the machine.

## Verify

`pnpm verify`

The suite uses temporary repositories, fake local Codex/OpenCode/Claude session
artifacts, and the real CLI entrypoints. It requires no authentication, network,
real model, or TTY.

## Non-goals

- An MCP server, headless planning, session resume, or removal of `--session`.
- Letting a planning tool approve a change or weakening the human approval gate.
- Changing the five-section opening prompt, its repository record, queue
  selection, queue item hashes, queue halt rules, or change execution.
- Reading planning logs from tools other than Codex, OpenCode, and Claude Code.
- Estimating missing model, usage, cost, or timing data.
- Uploading prompts, transcripts, tool calls, usage, or any other local data.
- Adding an AGY-specific instruction file without a confirmed AGY contract.

## Contract

### Requirement: Prompt handoff is the default planning path

`osq plan <slug> --brief <file>` and `osq plan --next` SHALL create the change
folder and `brief.md` through the established ordinary or queue path, build the
same complete five-section opening prompt used today, and write its exact bytes
to `<change>/plan-prompt.md`. The command SHALL NOT construct or spawn a harness
adapter and SHALL print one concise line containing the folder path and
`ask your planning tool to plan change <slug>`.

The default brief frontmatter SHALL record `planner: null`. Queue selection,
dependency projection, item hashes, replanning rules, and halt behavior SHALL
remain unchanged.

`--session` SHALL restore the existing interactive planner selection, brief
model attribution, process launch, and owned-session telemetry. `--print` SHALL
continue to emit the five-section prompt to stdout without spawning a session or
recording telemetry; it SHALL NOT leave `plan-prompt.md` behind.

#### Scenario: Brief handoff
- **WHEN** an author runs `osq plan <slug> --brief <file>` without `--session` or `--print`
- **THEN** the change has a null-attributed brief and exact five-section `plan-prompt.md`, no harness process or planning record exists, and stdout names the folder and change to plan

#### Scenario: Queue handoff
- **WHEN** an eligible item is selected by `osq plan --next`
- **THEN** exactly that item becomes planned with its established metadata and dependencies plus the same prompt file and no spawned session

#### Scenario: Explicit owned session
- **WHEN** an author runs either planning form with `--session`
- **THEN** osq uses the configured planner exactly as before, attributes the brief to that model, and records the owned interactive lifecycle and usage

#### Scenario: Print-only review
- **WHEN** an author runs either planning form with `--print`
- **THEN** stdout contains only the complete prompt and no prompt file, process, or planning record is created

### Requirement: Transient planning prompt

`plan-prompt.md` SHALL be treated as transient local context like `.run/`: it
SHALL be excluded from change lint input, approval and conflict hashes, and any
archive-verifier tree hash. Its creation, removal, or byte changes SHALL NOT
invalidate an approval seal. The watcher SHALL delete it before the completed
change is retained in the archive.

#### Scenario: Approval with a prompt file
- **WHEN** a change containing `plan-prompt.md` is linted, approved, and checked for authored drift
- **THEN** the prompt is ignored by lint and every content hash while all authored specification files remain covered

#### Scenario: Completed change is archived
- **WHEN** final verification passes for a change that still contains `plan-prompt.md`
- **THEN** the archived change retains its specification and `.run` record but not the transient prompt

### Requirement: Managed planning entry points

`osq init` SHALL manage a `.claude/commands/osq-plan.md` command that takes the
change slug as its argument and SHALL add a `Planning a change` section to the
existing osq block in `AGENTS.md`, which Codex reads. The Claude command SHALL
use the same osq start/end markers, so re-running init replaces stale managed
content while preserving every byte outside osq's markers; running init in an
existing repository SHALL add the planning entry points without rewriting
other existing files.

The Claude command, AGENTS section, and managed `PLANNER.md` template SHALL say
in their own tool-appropriate wording to read `plan-prompt.md` in the selected
change folder and follow it, write only inside that change folder, run
`osq lint <slug>` and fix all findings before finishing, and never run
`osq approve`.

`osq doctor` SHALL fail the managed-instructions check when either planning
entry point is missing, malformed, or stale and SHALL pass when both match the
installed osq version. AGY SHALL continue to receive the shared `AGENTS.md`
block until its project-instruction contract is confirmed.

#### Scenario: Existing repository is initialized
- **WHEN** `osq init` runs in a repository with hand-authored files and no planning entry points
- **THEN** current Claude and Codex planning instructions are installed while unrelated files and content outside managed markers remain byte-identical

#### Scenario: Planning instructions drift
- **WHEN** the Claude command or AGENTS planning section is absent or differs from the installed managed content
- **THEN** `osq doctor` reports an actionable managed-instructions failure that a repeated `osq init` repairs

### Requirement: Approval observes local planning sessions

Before sealing a change, `osq approve <id>` SHALL call
`findPlanningSessions`. The observer SHALL ask each available Codex, OpenCode,
and Claude Code reader for local sessions with at least one file-edit tool call
whose normalized target is inside the selected change folder and whose observed
edit time falls inclusively between folder creation and approval observation.
Path containment SHALL be segment-aware and SHALL reject sibling-prefix and
relative-path escapes.

Each match SHALL supply its harness, nullable model, observed start and end,
and independently nullable input, output, cached, and reasoning token counts and
cost. Missing stores, unreadable or malformed records, unsupported fields, and
individual reader failures SHALL yield no match or null fields without failing
approval. Readers SHALL inspect only metadata, usage, timestamps, tool names,
and tool path arguments needed for matching; they SHALL NOT retain transcript
content.

Matches SHALL be appended to `.run/plan.jsonl` as correlated records using the
existing `PlanRecord` lifecycle with `source: observed`. Existing explicit
`--session` records SHALL be identified as `source: owned` while legacy records
without a source remain readable as owned. A repeated approval SHALL not append
the same native session again, and deterministic reader/session ordering SHALL
make the log stable.

Codex and OpenCode readers SHALL extend their confirmed local readers to filter
sessions by edit path and time window. Claude Code SHALL read JSONL session
files below `~/.claude/projects/` using only the locally confirmed record and
file-edit tool shapes. Nothing SHALL be estimated.

#### Scenario: One Claude session edits the change
- **WHEN** a local Claude log contains one in-window session that edits a file inside the change and another session that does not
- **THEN** approval appends exactly one observed lifecycle pair carrying only the first session's observed identity and usage

#### Scenario: Reapproval sees the same native session
- **WHEN** approval is repeated without a new matching planning session
- **THEN** the append-only planning log and manifest session count do not gain a duplicate

#### Scenario: No local session matches
- **WHEN** every reader is absent, unreadable, malformed, out of window, or lacks an edit inside the change folder
- **THEN** approval succeeds without an observed record and prints one line saying that no planning record was found

### Requirement: Observed planner attribution at approval

The approval manifest SHALL count valid owned and observed `plan_started`
records in `planningSessions`, preserving the established handling of an owned
start whose exit is unavailable. Its nullable `planner` SHALL be the model from
the most recent observed session with a reported model, then the most recent owned
`--session` record with a reported model, else null. Configuration alone SHALL
never populate manifest planner attribution.

The default prompt-handoff path SHALL not require or resolve planner
configuration. Planner harness, model, and agent validation and selection SHALL
apply when `--session` is requested. Generated config and README guidance SHALL
state that the planning tool owns model choice unless osq is explicitly asked
to launch the session.

#### Scenario: Observed model is available
- **WHEN** approval observes a matching session with a model and an older owned session also exists
- **THEN** the manifest counts both sessions and attributes planner to the most recent reported observed model

#### Scenario: Only an owned session exists
- **WHEN** no observed session reports a model and `--session` recorded one
- **THEN** the manifest uses the most recent reported owned model

#### Scenario: No planning model is observed
- **WHEN** neither observed nor owned records supply a model
- **THEN** the manifest records `planner: null` regardless of planner configuration

### Requirement: Unified planning inspection and reporting

`osq show <id>` and the report planning block SHALL treat observed and owned
records under the same existing identity, ordering, incomplete-session, usage,
and coverage rules. Report text and stable JSON SHALL state how many changes
have at least one valid `plan_started` record of either kind; a change with
several sessions SHALL count once.

#### Scenario: Mixed planning sources
- **WHEN** active and archived changes contain complete observed and owned records plus malformed or incomplete lines
- **THEN** show lists valid sessions uniformly and report aggregates their observed usage while counting each covered change once

#### Scenario: Historical planning records
- **WHEN** a legacy lifecycle pair has no source field
- **THEN** show and report continue to read it as an owned session without changing recorded numeric values

## Task boundary note

Task 1 owns prompt creation and CLI mode selection. Task 2 owns every managed
instruction copy, initialization, doctor validation, and consumer guidance.
Task 3 owns the planning-record schema, approval observation, local readers,
manifest attribution, the approval notice, and its direct existing-test
expectation update. Task 4 owns transient-file lint, hash, and archive behavior.
Task 5 consumes task 3's planning projection from show and report without
reopening the planning readers. `src/core/show.ts` is intentionally shared:
task 3 makes only the nullable-model compatibility change and task 5 owns the
complete projection. Task 6 owns final-tree reconciliation for the generic
workflow expectation and golden event fixtures invalidated by task 2's
scaffold growth. No other production file is intentionally shared between
tasks. Task 1's narrowed scope spelling resolves to the same files recorded at
its completion while preventing its former `tests/plan*.test.ts` glob from
claiming task 3's later `tests/planning-observed.test.ts`.

## Human steps

- The Claude Code probe is complete. On this machine Claude Code 2.1.278 writes
  session JSONL below `~/.claude/projects/`; task 3 records the confirmed
  top-level session/timestamp/cwd fields, assistant model/usage/tool blocks,
  Write/Edit/NotebookEdit path arguments, and final cost-state fields used by
  the reader fixture. No transcript content is required by the implementation.
- Keep AGY on the managed `AGENTS.md` block unless a documented project
  instruction filename is confirmed; the installed `agy` CLI and Antigravity
  extension exposed no such contract during planning.
- Review this parent contract, capability deltas, and completed task bodies.
- After task bodies are complete, run `pnpm osq approve 043` yourself. Neither
  planner nor executor approves the change.

## Delta

- `specs/cli-foundation/spec.md`: prompt-file handoff, explicit session mode,
  null default attribution, managed Claude/Codex planning entry points, doctor
  drift checks, session-only planner configuration, and consumer guidance.
- `specs/spec-lint-and-approve/spec.md`: transient prompt lint/hash exclusion and
  approval-time planning discovery.
- `specs/watcher-and-harness/spec.md`: path-aware local session readers,
  observed planning records, manifest attribution, and archive cleanup.
- `specs/metrics-and-reporting/spec.md`: mixed-source planning aggregation and
  the count of changes carrying a planning record.
- `specs/status-inspection/spec.md`: owned and observed planning session display.
