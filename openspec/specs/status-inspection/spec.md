# status-inspection Specification

## Purpose

Provides operational visibility into active and archived specifications, task states, locks, and event timelines through `osq status` and `osq show`.

## Requirements

### Requirement: Specification queue status inspection
<!-- source: features/status-inspection.md # Status Inspection, src/core/status.ts, tests/status.test.ts, tests/status-rejected.test.ts -->
The system SHALL display an overview of active specifications, an archived
change count, and a separately listed rejected-change group via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every active change folder, the archive count, and rejected changes in their own group

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Show command, src/core/show.ts, src/cli/show.ts, src/core/status/pre-spawn-words.ts, tests/show.test.ts, tests/show-pre-spawn.test.ts, tests/show-digest.test.ts, tests/show-pre-spawn-missing.test.ts -->
The system SHALL display detailed task lists, metadata, planning sessions,
recertification decisions, results, and complete event timelines via
`osq show <id>`. Derived recertification history SHALL come from numbered typed
events rather than current or retained marker files. Each task with a pre-spawn
`verify_ran` event SHALL show its latest pre-spawn start in the same words the
watch log uses, from `formatPreSpawnStart`. An unapproved change SHALL also show
its approval digest and flags. `osq show <id> --json` SHALL print the same
details as JSON with a `digest` field, null for an approved change.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, recertification history when present, and the complete event timeline

#### Scenario: Pre-spawn verify result
- **WHEN** a task's event stream holds a `verify_ran` event with `phase: "pre_spawn"`
- **THEN** the task's entry prints `Pre-spawn verify: ` followed by the start words for the latest such event, such as `started red: verify fails` or `started green, but it declared red`, and a task without one prints no such line

#### Scenario: Pre-spawn verify with missing paths
- **WHEN** the latest pre-spawn event carries a non-empty `missingPaths`
- **THEN** the line reads `started red: <path>, <path> missing` in recorded order, and an empty or absent `missingPaths` words the start from its exit code alone

#### Scenario: Unreadable pre-spawn values
- **WHEN** the latest pre-spawn event lacks a finite exit code or a declared state
- **THEN** the line reads `Pre-spawn verify: unavailable`

#### Scenario: Unapproved change digest
- **WHEN** user executes `osq show <id>` for a change without `.run/approved`
- **THEN** the output ends with the same digest and flag lines `osq approve` would print

#### Scenario: JSON output
- **WHEN** user executes `osq show <id> --json`
- **THEN** stdout is one JSON object with the change details and a `digest` field holding the digest structure, or null when the change is approved

### Requirement: Code ownership
<!-- source: src/core/status/**, tests/queue*.test.ts -->
The Status Inspection capability SHALL own execution queue overview formatting,
detailed change inspection, state derivation, rejected-change presentation,
runtime dependency completion resolution, human attention projection, and
read-only brief queue parsing and state projection.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for status, inbox, or brief queue inspection
- **THEN** system maps `src/core/status/**` and `tests/queue*.test.ts` to status-inspection

### Requirement: Undeclared test change status inspection
<!-- source: src/core/status.ts, src/core/show.ts, tests/show.test.ts -->
The status and show commands SHALL present `undeclared_test_change` dead status and diagnostic details.

#### Scenario: Status line rendering for undeclared test change
- **WHEN** a task fails with dead reason `undeclared_test_change`
- **THEN** `osq status` formats the task line as `[dead] (reason: undeclared_test_change)`

#### Scenario: Show command diagnostics
- **WHEN** `osq show <id>` inspects a task marked dead with `undeclared_test_change`
- **THEN** output displays diagnostic details identifying modified test files

### Requirement: Planning session inspection
<!-- source: src/core/show.ts, src/core/planning.ts, tests/show.test.ts -->
`osq show <id>` SHALL read `.run/plan.jsonl`, correlate valid owned and observed
lifecycle records by planning-session identifier, and list complete and
incomplete sessions in start order with the established harness, nullable
model, start time, exit code, and wall seconds fields. A legacy record without
source SHALL remain readable as owned.

Missing fields, malformed lines, and incomplete lifecycle pairs SHALL not
prevent task details or the event timeline from rendering, and no missing value
shall be estimated.

#### Scenario: Inspecting repeated planning
- **WHEN** a change has more than one valid owned or observed lifecycle
- **THEN** show lists every session and its recorded wall time before the task event timeline

#### Scenario: Incomplete or malformed planning history
- **WHEN** a planning start lacks a matching exit or the log contains malformed lines
- **THEN** show retains the valid start with unavailable exit fields and continues rendering tasks and events

#### Scenario: Owned and observed sessions are inspected
- **WHEN** a change has valid sessions from both sources
- **THEN** show lists both uniformly in start order with their observed identity and timing fields

#### Scenario: Legacy or incomplete planning history
- **WHEN** a legacy pair lacks source or a valid start lacks its exit
- **THEN** the legacy pair is labeled owned, unavailable exit fields remain unavailable, and remaining change details still render

### Requirement: Rejected change status group
<!-- source: src/core/layout.ts, src/core/status.ts, tests/status-rejected.test.ts -->
`osq status` SHALL discover changes under the canonical rejected directory and
render them in a deterministic `Rejected specs` group separate from active
specifications and the archived count. Each rejected row SHALL identify the
folder and title plus rejection reason and timestamp when valid marker metadata
is available. Missing or malformed rejection metadata SHALL be shown as
unavailable without hiding the change.

#### Scenario: Rejected changes are listed separately
- **WHEN** active, archived, and rejected change folders exist
- **THEN** status lists each rejected folder only in `Rejected specs` and does not add it to active state or archived totals

#### Scenario: Rejection metadata is malformed
- **WHEN** a rejected folder has a missing or malformed `.run/rejected.md`
- **THEN** status still lists the folder and title with unavailable rejection metadata

### Requirement: Rejected dependency resolution
<!-- source: src/core/state.ts, src/core/layout.ts, tests/state-rejected.test.ts -->
Runtime dependency resolution SHALL recognize a dependency retained under the
canonical rejected directory and SHALL always treat it as not landed. Approval,
done markers, tasks, or other preserved contents inside the rejected folder
SHALL NOT satisfy the dependency.

#### Scenario: Rejected dependency remains unmet
- **WHEN** an active change depends on an identifier found under `rejected/`
- **THEN** its dependency remains unmet and the change derives as blocked even if the rejected folder contains done markers

### Requirement: Human attention inbox projection
<!-- source: src/core/inbox.ts, src/core/status.ts, src/core/state.ts, tests/inbox.test.ts -->
The system SHALL derive a human attention inbox with deterministic `needsYou`,
`running`, and `landed` groups. Active attention and running entries SHALL be
projected from the existing status/state snapshot rather than independent
marker reads.

`needsYou` SHALL contain unapproved active changes with `proposal.md`, active
dead and regressed tasks, and active change-level regressions. `running` SHALL
contain only derived running tasks whose parsed lock PID is currently live,
with PID, lock start time, and non-negative elapsed seconds. `landed` SHALL use
only valid typed `archived` events as authoritative archive timestamps. Needs
and running entries SHALL sort by numeric change/task order; landed entries
SHALL sort newest first.

The inbox integration fixture SHALL create ignored runtime lock directories
before injecting live lock markers so the suite runs from tracked files in a
clean checkout without relying on empty directories or developer worktree
artifacts.

#### Scenario: Mixed attention state
- **WHEN** active changes include unapproved proposals, dead or regressed tasks, a change regression, and live and stale running locks
- **THEN** the inbox contains every attention item once, includes only the live running task, and leaves every marker unchanged

#### Scenario: Recorded archive state
- **WHEN** archived folders contain valid and malformed change-level event streams
- **THEN** only folders with a valid archived event are eligible for the landed group without filesystem-time inference

#### Scenario: Clean-checkout live-lock fixture
- **WHEN** the inbox integration suite copies only tracked fixture files and injects a live running lock
- **THEN** test setup creates the missing ignored parent directory before writing the lock and exercises the real bare CLI

### Requirement: Action command contract
<!-- source: src/core/inbox.ts, src/core/status/blocked-item.ts, tests/inbox.test.ts, tests/inbox-blocked.test.ts -->
Every inbox item SHALL expose one exact `command`. Approval items SHALL use
`osq approve <id>`; dead and regressed tasks SHALL use
`osq retry <id> <n>`, except a task that died with `blocked`, which SHALL use
`osq reject <id> --reason <text>`; change-level regressions SHALL use
`osq reject <id> --reason <text>`; and running and landed items SHALL use
`osq show <id>`. Each rendered text row SHALL end with the same command.

#### Scenario: Actionable item projection
- **WHEN** any attention, running, or landed item is projected
- **THEN** its JSON command and trailing text command are identical and match its item kind

#### Scenario: Blocked task command
- **WHEN** a dead task's reason is `blocked`
- **THEN** its JSON command and trailing text command are both `osq reject <id> --reason <text>`

### Requirement: Stable inbox object
<!-- source: src/core/status/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/inbox-stuck.test.ts, tests/disclosures-inbox-show.test.ts, tests/inbox-next-step.test.ts -->
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, `verification-pending`, or
`verification-failed`; only task kinds SHALL carry `task: { number, title }`. A
`task-dead` item for a stuck task SHALL also carry `stuck: { fingerprint }`; no
other item carries `stuck`. An approval item whose change has steps before
approval SHALL also carry `beforeApproval: true`; no other item carries
`beforeApproval`. A running item SHALL contain `change`, `task`, numeric `pid`,
ISO `startedAt`, integer non-negative `elapsedSeconds`, and `command`. A landed
item SHALL contain `change`, ISO `archivedAt`, and `command`. A landed item
whose tasks disclosed anything SHALL also carry `disclosures: { deviated,
missingContext, outsideScope }`, the number of tasks with each real section; no
other landed item carries `disclosures`. Empty groups SHALL be empty arrays and
JSON output SHALL contain no additional prose or metadata.

#### Scenario: JSON contract projection
- **WHEN** the inbox is serialized for `osq --json`
- **THEN** its property set, discriminants, nested identities, value types, and deterministic array ordering match the stable contract

#### Scenario: Text and JSON parity
- **WHEN** text and JSON are rendered from an equivalent filesystem snapshot and clock
- **THEN** both representations contain the same ordered items, commands, elapsed values, and archive timestamps

#### Scenario: Stuck field
- **WHEN** a dead task is stuck
- **THEN** its `task-dead` item carries `stuck: { fingerprint }` and every other item's JSON is unchanged

#### Scenario: Landed change with disclosures
- **WHEN** a landed change has one task with a real `## Outside scope` section
- **THEN** its landed item carries `disclosures: { deviated: 0, missingContext: 0, outsideScope: 1 }`, its text line ends with `— disclosed: outside scope 1`, and every other landed item is unchanged

#### Scenario: Steps before approval
- **WHEN** an unapproved planned change has `### Before approval` steps
- **THEN** its approval item carries `beforeApproval: true` and every other item's JSON is unchanged

### Requirement: Per-project last-look cursor
<!-- source: src/core/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts -->
Every bare inbox invocation SHALL read and then advance
`~/.osq/last-look/<sha256(realpath(project-root))>.json`, whose JSON content
contains an ISO `lastLook` timestamp. A valid cursor SHALL select archived
events strictly later than that timestamp. A missing, deleted, unreadable,
malformed, or invalid-date cursor SHALL select the newest ten recorded
archives. Text and JSON invocations SHALL both advance the cursor without
writing inside any active, archived, or rejected change folder.

#### Scenario: Valid prior look
- **WHEN** a valid project cursor exists
- **THEN** landed contains only changes archived after it and the invocation advances the cursor

#### Scenario: Missing or invalid prior look
- **WHEN** the project cursor cannot supply a valid timestamp
- **THEN** landed contains at most the newest ten recorded archives and a fresh valid cursor is written

### Requirement: Concise inbox text
<!-- source: src/core/inbox.ts, tests/inbox.test.ts -->
Text output SHALL render `Needs you`, `Running`, and `Landed since last look` in
that order. Each empty group SHALL contain exactly one `(none)` line when any
group is non-empty. When every group is empty, output SHALL be exactly
`Inbox empty.`. Running elapsed time SHALL use the existing duration formatter,
and every non-empty item row SHALL end with its exact action command.

#### Scenario: Partially empty inbox
- **WHEN** at least one group contains an item and another group is empty
- **THEN** all headings render and each empty group has one `(none)` line

#### Scenario: Entirely empty inbox
- **WHEN** no group contains an item
- **THEN** the complete text output is the single line `Inbox empty.`

### Requirement: Queue module boundaries
<!-- source: src/core/queue*.ts, tests/queue*.test.ts, tests/line-budget.test.ts -->
Queue parsing, filesystem association and state projection, planning selection
and spend, and report-only queue derivation SHALL live in cohesive modules that
pass the repository source-line budget. `src/core/queue.ts` SHALL remain the
stable public facade for the established queue API.

The decomposition SHALL preserve queue behavior and types, keep report-only
derivation outside the parsing, state, and planning modules, and SHALL NOT add
queue modules to the source-line allow list.

#### Scenario: Queue modules remain bounded
- **WHEN** queue planning or reporting responsibilities are added
- **THEN** the source-line budget and queue regression tests pass through the stable queue entrypoints without a new allow-list entry

### Requirement: Read-only brief queue parsing
<!-- source: src/core/status/queue-parser.ts, tests/queue.test.ts, tests/fixes-declaration.test.ts -->
The system SHALL parse ordered items only from `openspec/queue.md`. Each item
SHALL consist of a unique `## [slug] Title` heading, one `Depends on:` line
naming comma-separated earlier slugs or `nothing`, an optional `Fixes:` line
right after it naming comma-separated earlier slugs, and a non-empty brief body.
Invalid headings, slugs, titles, bodies, dependency or fixes lines, duplicate
values, and unknown, self, or forward dependencies or fixes SHALL be rejected
with queue and item context before mutation.

Each item SHALL retain its brief body and a deterministic `sha256:` digest of
the complete raw section from its heading to the next matching item heading or
EOF. Parsing and inspection SHALL never write, normalize, or reformat the queue
file.

#### Scenario: Ordered queue sections
- **WHEN** a valid queue contains items with earlier-item dependencies
- **THEN** parsing returns source-ordered slugs, titles, dependencies, bodies, and exact raw-section hashes

#### Scenario: Invalid queue sections
- **WHEN** a queue has malformed or ambiguous item or dependency syntax
- **THEN** parsing reports the queue path and offending item without changing any file

#### Scenario: Fixes line
- **WHEN** an item's `Depends on:` line is followed by `Fixes: first-item` and `first-item` is an earlier item
- **THEN** parsing returns `fixes: ["first-item"]` and a body that does not include the `Fixes:` line

#### Scenario: Invalid fixes line
- **WHEN** a `Fixes:` line names an unknown, later, repeated, or the item's own slug, or is empty
- **THEN** parsing fails naming the queue path and the item

### Requirement: Brief queue state projection
<!-- source: src/core/queue.ts, src/cli/queue.ts, tests/queue.test.ts, src/core/status/queue-state.ts, tests/verification-dependents.test.ts -->
Queue state SHALL be derived afresh from `queue_item` and `queue_hash` metadata
in active, archived, and rejected change briefs plus canonical task markers.
Unrelated folders SHALL not associate by name alone.

An archived association SHALL derive as landed, or as `verification-pending`
while its change is verification pending. An active association SHALL derive as
dead for dead or regressed state, running for running state, approved for any
other approved state, and planned when unapproved. Rejected history without an
active or archived association SHALL derive as rejected; no association SHALL
derive as unplanned. Rows SHALL include the selected change id, all retained
rejection attempts, unmet queue dependencies, and a changed since planned
annotation when the selected association's recorded section hash does not equal
the current section hash.

Only a landed archived queue association SHALL satisfy a queue dependency.
Verification pending, rejected, done-but-unarchived, manually name-matched, and
missing associations SHALL not land an item. Ambiguous multiple active or
archived associations SHALL be reported rather than silently selected.

#### Scenario: Mixed queue lifecycle
- **WHEN** current queue items have active, archived, rejected, and absent associations
- **THEN** every item receives one deterministic state plus change, rejection, dependency, and drift details

#### Scenario: Queue section changes after planning
- **WHEN** a current raw section hash differs from its associated brief's `queue_hash`
- **THEN** inspection reports changed since planned without rewriting or changing the state of the associated change

#### Scenario: Verification pending queue dependency
- **WHEN** queue item `beta` depends on `alpha`, whose archived change is verification pending
- **THEN** `alpha` shows as `verification-pending`, `beta` lists `alpha` as unmet, and `osq plan --next` does not select `beta`

### Requirement: Recertification inspection
<!-- source: src/core/show.ts, tests/show.test.ts -->
`osq show <id>` SHALL derive an ordered recertification view only from typed
`recertification` events in numbered task streams for active and archived
changes. Each valid row SHALL expose task, timestamp, outcome, differing paths
and per-path attribution, verify command, exit code, and timeout state.

The text view SHALL render a `Recertifications` section only when such rows
exist. Passed outcomes SHALL be labeled recertified and requeued outcomes SHALL
be labeled requeued for agent work. Attribution SHALL render a later task
number, `ambiguous`, or `unknown` for each sorted path. Malformed optional data
SHALL display as unavailable without preventing the rest of the change from
rendering.

#### Scenario: Recertified active or archived task
- **WHEN** a numbered event stream contains a valid passed recertification event
- **THEN** show lists the recertified task, verification result, differing paths, and structured attribution before retaining the complete event timeline

#### Scenario: Failed recertification history
- **WHEN** a task contains a requeued recertification followed by later lifecycle events
- **THEN** show retains the requeued decision as its own ordered history row

#### Scenario: Malformed recertification data
- **WHEN** optional recertification fields are absent or malformed
- **THEN** show renders available identity and outcome with unavailable values and continues rendering all other details

### Requirement: Stuck and automatic retry inspection
<!-- source: src/core/status/state.ts, src/core/status/inbox.ts, src/core/status/inbox-text.ts, src/core/status/show.ts, tests/inbox-stuck.test.ts, tests/show-retries.test.ts -->
A dead task whose active marker has `stuck: true` SHALL derive `stuck` with its
fingerprint. Its inbox text row SHALL say the same failure happened twice and
suggest amending the spec or `osq reject`, before its unchanged `osq retry`
command. `osq show` SHALL print `Retries: <n> (<a> automatic)` for a task with
retry events and `Stuck: same failure twice (<fingerprint>)` for a stuck task.

#### Scenario: Stuck task in the inbox
- **WHEN** a dead task's active marker has `stuck: true` and a fingerprint
- **THEN** its inbox row reads `task <n>: <title> — stuck: same failure twice; amend the spec or osq reject <id> --reason <text> — osq retry <id> <n>`

#### Scenario: Retries in show
- **WHEN** a task's event stream has one manual and one automatic `retry` event
- **THEN** its show entry prints `Retries: 2 (1 automatic)`, and a task without retry events prints no such line

### Requirement: Task disclosure inspection
<!-- source: src/core/status/show.ts, src/core/report/result-sections.ts, tests/disclosures-inbox-show.test.ts -->
For each task whose result file has a real `## Deviated`, `## Missing context`,
or `## Outside scope` section, `osq show <id>` SHALL print one
`Disclosures: <names>` line in the task's entry naming those sections in that
order. A task without one SHALL print no such line.

#### Scenario: Task with disclosures
- **WHEN** a task's result file has a real `## Deviated` section and an `## Outside scope` section, and its `## Missing context` says `None`
- **THEN** its entry prints `Disclosures: deviated, outside scope`

### Requirement: Change next step
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `verification-pending` or `landed`.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries no `verification`
- **THEN** its next step is `landed` with a null command

### Requirement: Next step commands
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq retry <id> <n>` for the first dead or regressed task, else
`osq reject <id> --reason <text>`; `osq show <dep>` for the first unmet
dependency; `osq check <id>` while a check has not run since archive, else
`osq verified <id> --passed|--failed`; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

### Requirement: Next step detail and format
<!-- source: src/core/status/next-step.ts, tests/next-step.test.ts -->
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `failed` for a `verification-pending` change whose latest outcome
failed, and null otherwise. `formatNextStep` SHALL render the state with spaces
for hyphens, then ` (<detail>)` when set, then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `verification pending (failed) — osq verified <id> --passed|--failed`

### Requirement: Verification state
<!-- source: src/core/status/verification.ts, tests/next-step.test.ts -->
`readVerification(folderPath)` SHALL read an archived change's
`.run/events/change.jsonl`, skipping malformed lines. A change SHALL require
verification when its latest `archived` event carries `verification`, and SHALL
be verification pending while it requires verification and its latest
`verification_recorded` outcome is not `passed`. `listPendingVerifications`
SHALL return every pending archived change in numeric order.

#### Scenario: Passed then failed
- **WHEN** a change records `passed` and later `failed`
- **THEN** it is verification pending with outcome `failed`

### Requirement: Verification pending dependency
<!-- source: src/core/status/dependency-readiness.ts, src/core/status/state.ts, tests/verification-dependents.test.ts -->
Runtime dependency resolution SHALL treat an archived dependency as met only
when it is not verification pending. A pending or failed dependency SHALL keep
its dependents blocked. An archived dependency whose `archived` event carries no
`verification` SHALL be met, as before.

#### Scenario: Pending dependency
- **WHEN** change 013 depends on archived change 012, which is verification pending
- **THEN** 013 derives as blocked until 012 records `passed`

### Requirement: Explicit status with next steps
<!-- source: src/core/status/status.ts, src/cli/status.ts, tests/next-step.test.ts, tests/status.test.ts -->
`osq status` SHALL keep its task table, archive count, and rejected group, and
print `  next: <next step>` under each active change. It SHALL list verification
pending archived changes under `Verification pending:` before `Archived specs`,
as `<folder>: <title> — <next step>`. It SHALL NOT read or advance last-look
state.

#### Scenario: Full status with next steps
- **WHEN** a user executes `osq status` with an unplanned change and a pending archived change
- **THEN** the change's line is followed by `  next: unplanned — osq plan <id>`, the pending change is listed, and no last-look cursor is mutated

### Requirement: Planning inbox items
<!-- source: src/core/status/inbox.ts, src/core/status/inbox-text.ts, tests/inbox-next-step.test.ts -->
The inbox SHALL show an unapproved change whose next step is `unplanned` as a
`planning` item with that command instead of an approval item. An approval item
whose change has steps before approval SHALL carry `beforeApproval: true`, and
its text line SHALL read `— do the steps before approval first — osq approve
<id>`. A planning line SHALL read `— unplanned — <command>`.

#### Scenario: Fresh template in the inbox
- **WHEN** a change still has the placeholder verify
- **THEN** the inbox lists it as `planning` with `osq plan <id>` and offers no `osq approve <id>`

### Requirement: Verification inbox items
<!-- source: src/core/status/inbox.ts, src/core/status/inbox-projection.ts, src/core/status/inbox-text.ts, tests/inbox-next-step.test.ts -->
Every verification pending archived change SHALL add one needs-you item after
the active items, in numeric order: `verification-failed` when its latest
outcome failed, else `verification-pending`, with `task: null` and its next-step
command. The text line SHALL read `— verification pending — <command>` or `—
verification failed — <command>`.

#### Scenario: Failed outcome in the inbox
- **WHEN** archived change 012 records `failed`
- **THEN** the inbox lists a `verification-failed` item for 012 with `osq verified 012 --passed|--failed`

### Requirement: Show next step
<!-- source: src/core/status/show.ts, src/cli/show.ts, tests/show-next-step.test.ts -->
`osq show <id>` SHALL print `Next: <next step>` after `Status:` for active and
archived changes, and `--json` SHALL carry `next: { state, command, detail }`.
For an archived change that requires verification, it SHALL print a
`Verification:` section with each `check_ran` event's time, command, and exit
code and each `verification_recorded` event's time, outcome, and note.

#### Scenario: Archived change with an outcome
- **WHEN** `osq show 012` runs on an archived change that recorded `passed`
- **THEN** it prints `Next: landed` and a `Verification:` section with the outcome

### Requirement: Blocked inbox items
<!-- source: src/core/status/blocked-item.ts, src/core/status/inbox-projection.ts, src/core/status/inbox.ts, src/core/status/inbox-text.ts, tests/inbox-blocked.test.ts -->
A `task-dead` inbox item whose task died with reason `blocked` SHALL carry
`blocked: { need }`, where `need` is the task result file's `## Blocked` text as
`parseResultSections` reads it. When the result file has no such section, `need`
SHALL be `(not stated)`. The item's command SHALL be
`osq reject <id> --reason <text>`. Its text row SHALL be
`<task row> — blocked: <need> — reject, then osq plan --next --replan — osq reject <id> --reason <text>`,
with whitespace in the need, line breaks included, collapsed to single spaces.
Every other `task-dead` item SHALL stay exactly as before.

#### Scenario: Blocked task in the inbox
- **WHEN** task 1 of change 001 died with `blocked` and its result file's `## Blocked` says `Needs src/b.ts in scope`
- **THEN** `osq --json` gives its `task-dead` item `blocked: { need: "Needs src/b.ts in scope" }` and the command `osq reject 001 --reason <text>`, and the text row shows the need and `osq plan --next --replan`

#### Scenario: Other dead task
- **WHEN** a task died with `verify_red`
- **THEN** its item has no `blocked` key and its command is `osq retry <id> <n>`

### Requirement: Instructions changed in show
<!-- source: src/core/status/show.ts, tests/instructions-drift.test.ts -->
`osq show` SHALL print, under each task whose stream holds an
`instructions_changed` event, the line
`      Instructions changed after approval: <changed joined by ", ">` from the
latest such event. Other tasks' output SHALL be unchanged.

#### Scenario: Marked task
- **WHEN** task 2's stream holds an `instructions_changed` event with `changed: ["AGENTS.md", "ADR 009 added"]`
- **THEN** `osq show` prints `      Instructions changed after approval: AGENTS.md, ADR 009 added` under task 2

### Requirement: Dependencies added in show
<!-- source: src/core/status/show.ts, tests/dependencies-report.test.ts -->
`osq show` SHALL print, under each task whose stream holds a
`dependencies_added` event, the line
`      Dependencies added: <name> (<file>), ...` with the distinct pairs from
every such event, sorted by file and then name. Other tasks' output SHALL be
unchanged.

#### Scenario: Task added a package
- **WHEN** task 1's stream holds a `dependencies_added` event adding `zod` to `package.json`
- **THEN** `osq show` prints `      Dependencies added: zod (package.json)` under task 1
