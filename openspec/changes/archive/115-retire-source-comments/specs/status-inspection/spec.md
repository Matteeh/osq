## MODIFIED Requirements

### Requirement: Specification queue status inspection
The system SHALL display an overview of active specifications, an archived
change count, and a separately listed rejected-change group via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every active change folder, the archive count, and rejected changes in their own group

### Requirement: Detailed specification inspection
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

### Requirement: Undeclared test change status inspection
The status and show commands SHALL present `undeclared_test_change` dead status and diagnostic details.

#### Scenario: Status line rendering for undeclared test change
- **WHEN** a task fails with dead reason `undeclared_test_change`
- **THEN** `osq status` formats the task line as `[dead] (reason: undeclared_test_change)`

#### Scenario: Show command diagnostics
- **WHEN** `osq show <id>` inspects a task marked dead with `undeclared_test_change`
- **THEN** output displays diagnostic details identifying modified test files

### Requirement: Planning session inspection
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
Runtime dependency resolution SHALL recognize a dependency retained under the
canonical rejected directory and SHALL always treat it as not landed. Approval,
done markers, tasks, or other preserved contents inside the rejected folder
SHALL NOT satisfy the dependency.

#### Scenario: Rejected dependency remains unmet
- **WHEN** an active change depends on an identifier found under `rejected/`
- **THEN** its dependency remains unmet and the change derives as blocked even if the rejected folder contains done markers

### Requirement: Human attention inbox projection
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
For each task whose result file has a real `## Deviated`, `## Missing context`,
or `## Outside scope` section, `osq show <id>` SHALL print one
`Disclosures: <names>` line in the task's entry naming those sections in that
order. A task without one SHALL print no such line.

#### Scenario: Task with disclosures
- **WHEN** a task's result file has a real `## Deviated` section and an `## Outside scope` section, and its `## Missing context` says `None`
- **THEN** its entry prints `Disclosures: deviated, outside scope`

### Requirement: Change next step
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
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `failed` for a `verification-pending` change whose latest outcome
failed, and null otherwise. `formatNextStep` SHALL render the state with spaces
for hyphens, then ` (<detail>)` when set, then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `verification pending (failed) — osq verified <id> --passed|--failed`

### Requirement: Verification state
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
Runtime dependency resolution SHALL treat an archived dependency as met only
when it is not verification pending. A pending or failed dependency SHALL keep
its dependents blocked. An archived dependency whose `archived` event carries no
`verification` SHALL be met, as before.

#### Scenario: Pending dependency
- **WHEN** change 013 depends on archived change 012, which is verification pending
- **THEN** 013 derives as blocked until 012 records `passed`

### Requirement: Explicit status with next steps
`osq status` SHALL keep its task table, archive count, and rejected group, and
print `  next: <next step>` under each active change. It SHALL list verification
pending archived changes under `Verification pending:` before `Archived specs`,
as `<folder>: <title> — <next step>`. It SHALL NOT read or advance last-look
state.

#### Scenario: Full status with next steps
- **WHEN** a user executes `osq status` with an unplanned change and a pending archived change
- **THEN** the change's line is followed by `  next: unplanned — osq plan <id>`, the pending change is listed, and no last-look cursor is mutated

### Requirement: Planning inbox items
The inbox SHALL show an unapproved change whose next step is `unplanned` as a
`planning` item with that command instead of an approval item. An approval item
whose change has steps before approval SHALL carry `beforeApproval: true`, and
its text line SHALL read `— do the steps before approval first — osq approve
<id>`. A planning line SHALL read `— unplanned — <command>`.

#### Scenario: Fresh template in the inbox
- **WHEN** a change still has the placeholder verify
- **THEN** the inbox lists it as `planning` with `osq plan <id>` and offers no `osq approve <id>`

### Requirement: Verification inbox items
Every verification pending archived change SHALL add one needs-you item after
the active items, in numeric order: `verification-failed` when its latest
outcome failed, else `verification-pending`, with `task: null` and its next-step
command. The text line SHALL read `— verification pending — <command>` or `—
verification failed — <command>`.

#### Scenario: Failed outcome in the inbox
- **WHEN** archived change 012 records `failed`
- **THEN** the inbox lists a `verification-failed` item for 012 with `osq verified 012 --passed|--failed`

### Requirement: Show next step
`osq show <id>` SHALL print `Next: <next step>` after `Status:` for active and
archived changes, and `--json` SHALL carry `next: { state, command, detail }`.
For an archived change that requires verification, it SHALL print a
`Verification:` section with each `check_ran` event's time, command, and exit
code and each `verification_recorded` event's time, outcome, and note.

#### Scenario: Archived change with an outcome
- **WHEN** `osq show 012` runs on an archived change that recorded `passed`
- **THEN** it prints `Next: landed` and a `Verification:` section with the outcome

### Requirement: Blocked inbox items
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
`osq show` SHALL print, under each task whose stream holds an
`instructions_changed` event, the line
`      Instructions changed after approval: <changed joined by ", ">` from the
latest such event. Other tasks' output SHALL be unchanged.

#### Scenario: Marked task
- **WHEN** task 2's stream holds an `instructions_changed` event with `changed: ["AGENTS.md", "ADR 009 added"]`
- **THEN** `osq show` prints `      Instructions changed after approval: AGENTS.md, ADR 009 added` under task 2

### Requirement: Dependencies added in show
`osq show` SHALL print, under each task whose stream holds a
`dependencies_added` event, the line
`      Dependencies added: <name> (<file>), ...` with the distinct pairs from
every such event, sorted by file and then name. Other tasks' output SHALL be
unchanged.

#### Scenario: Task added a package
- **WHEN** task 1's stream holds a `dependencies_added` event adding `zod` to `package.json`
- **THEN** `osq show` prints `      Dependencies added: zod (package.json)` under task 1

### Requirement: Focused runs in show
`osq show` SHALL print, under each task whose stream holds `focused_ran`
events, the line `      Focused runs: <entry>, <entry>`, with one entry per
event in stream order. An entry is `<outcome> <duration>s`, and a `failed`
entry adds ` (attempt ended, verify skipped)`. The line comes after the
`Scenarios:` line. Other tasks' output SHALL be unchanged.

#### Scenario: Failed then passed
- **WHEN** task 2's stream holds a `focused_ran` with outcome `failed` and duration 0.14, then one with outcome `passed` and duration 0.13
- **THEN** `osq show` prints `      Focused runs: failed 0.14s (attempt ended, verify skipped), passed 0.13s` under task 2

### Requirement: Mutation in show
`osq show` SHALL print, under each task whose stream holds `mutation_ran`
events after its last `measures` start event, the line
`      Mutation: <entry>; <entry>`, with one entry per event in stream order.
A measured entry is `<file>#<function> <killed> of <killed + survived> killed`,
and a not-measured one is `<file>#<function> not measured (<reason>)`. Each
survivor then gets the line
`        Survived: <file>:<line>:<column> <mutator> -> <replacement>`. These
lines come after the `Focused runs:` line. Other tasks' output SHALL be
unchanged.

#### Scenario: One survivor
- **WHEN** task 1's latest mutation check measured `quote` with 18 killed and one survivor at line 36, column 19, `ConditionalExpression` replaced with `false`
- **THEN** `osq show` prints `      Mutation: src/pricing/quote.ts#quote 18 of 19 killed` and `        Survived: src/pricing/quote.ts:36:19 ConditionalExpression -> false` under task 1

### Requirement: Change locations
`src/core/status/change-locations.ts` SHALL be the one place that lists the
trees changes live in and the change folders in them. `changeTrees` SHALL
return each tree with its root and its changes, archive, and rejected
directories. The first tree SHALL be the project root. With `vcs.enabled` and
`GitVcs` selected, one tree SHALL follow for each worktree from `worktreeList`
whose branch starts with `osq/`, whose path is not the project root, and
which holds its change, and that tree SHALL carry `worktreeFolder`, the
branch name without `osq/`. A worktree holds its change `<folder>` when its
changes directory holds `<folder>/.run/approved`, or its archive or rejected
directory holds `<folder>`. A worktree that does not hold its change SHALL
get no tree, and SHALL hide neither the checkout's copy of the folder nor a
stacked tree of it. After
them, one tree SHALL follow for each directory directly under the stacked
approval directory `<vcs.worktreeRoot>/<repo>/.stacked/`, rooted at that
directory and carrying `stackedFolder`, the directory's name, unless a
worktree tree already names that folder. Otherwise the project root SHALL be
the only tree. A worktree or stacked tree SHALL contribute only the change
folder its `worktreeFolder` or `stackedFolder` names, and the project root
SHALL NOT report an active folder that a worktree or stacked tree names.
When the project root holds an archived or rejected folder, a worktree or
stacked tree SHALL NOT report the folder of the same name in the same
location, because the checkout's copy is the landed one. An active folder
still comes from the worktree or stacked tree that names it.
`listChanges` SHALL return directories only, active first, then archived, then
rejected, each in numeric prefix order. An active folder SHALL pass
`isActiveChangeFolderName`, and an archived or rejected one SHALL NOT start
with `_` or `.`. Each change SHALL carry its folder name, absolute path,
location, and tree. `findChange` SHALL match an active change by exact name, by
number with or without zero padding, or by that number followed by `-`, as
`findSpecFolder` does, and SHALL fail with its message when nothing matches.
`locateFolder` SHALL return the change an absolute folder path names, or null.
`changesDirLabel` SHALL return the changes directory relative to the project
root, for display.

#### Scenario: Order and filters
- **WHEN** a project has active `010-b` and `002-a`, a file `notes.md` and a folder `_scratch` in `changes/`, archived `001-x`, and rejected `003-y`
- **THEN** `listChanges` returns `002-a`, `010-b`, `001-x`, and `003-y` in that order, with locations active, active, archived, and rejected

#### Scenario: Lookup by number
- **WHEN** `findChange` is asked for `7` and the active change `007-seven` exists
- **THEN** it returns `007-seven`

#### Scenario: Lookup miss
- **WHEN** `findChange` is asked for `9` and no active change matches
- **THEN** it fails with `Spec "9" not found in <changesDir>`

#### Scenario: Locate an archived folder
- **WHEN** `locateFolder` is given the absolute path of `archive/001-x`
- **THEN** it returns that change with location `archived`

#### Scenario: One tree today
- **WHEN** `changeTrees` runs for a project with `vcs.enabled` off
- **THEN** it returns exactly one tree, rooted at the project root

#### Scenario: Running change in a worktree
- **WHEN** `vcs.enabled` is on, the checkout has active `001-a` and `002-b`, and a worktree on `osq/001-a` holds active `001-a` and `002-b`
- **THEN** `listChanges` returns `001-a` from the worktree and `002-b` from the checkout, and `findChange` for `1` returns the worktree's `001-a`

#### Scenario: Worktree of another branch
- **WHEN** `vcs.enabled` is on and a worktree is on a branch not starting with `osq/`
- **THEN** `changeTrees` returns no tree for it

#### Scenario: Stacked change
- **WHEN** `vcs.enabled` is on, the checkout has active `002-b`, and `<vcs.worktreeRoot>/<repo>/.stacked/002-b` holds active `002-b` with `.run/approved`
- **THEN** `changeTrees` ends with a tree rooted at that directory whose `stackedFolder` is `002-b` and which has no `worktreeFolder`, and `listChanges` and `findChange` for `2` return `002-b` from that tree only

#### Scenario: Stacked folder with a worktree
- **WHEN** a stacked directory `002-b` exists and a worktree on `osq/002-b` holds `002-b` with `.run/approved`
- **THEN** `changeTrees` returns no stacked tree for `002-b`, and `listChanges` returns `002-b` from the worktree only

#### Scenario: Worktree without its change
- **WHEN** a stacked directory `002-b` exists and a worktree on `osq/002-b` holds no `002-b` in its changes, archive, or rejected directory
- **THEN** `changeTrees` returns no tree for that worktree and ends with the stacked tree for `002-b`, and `findChange` for `2` returns `002-b` from the stacked tree

#### Scenario: Worktree with an unapproved copy
- **WHEN** a worktree on `osq/002-b` holds `002-b` in its changes directory without `.run/approved`, and the checkout has active `002-b`
- **THEN** `changeTrees` returns no tree for that worktree, and `listChanges` returns `002-b` from the checkout

#### Scenario: Archived or rejected in its worktree
- **WHEN** a worktree on `osq/001-a` holds `001-a` only in its archive directory, and another on `osq/003-c` holds `003-c` only in its rejected directory
- **THEN** `changeTrees` returns a tree for each, and `listChanges` returns `001-a` as archived and `003-c` as rejected from those trees

#### Scenario: Stacked directory with the flag off
- **WHEN** `vcs.enabled` is off and a stacked directory exists
- **THEN** `changeTrees` returns exactly one tree

#### Scenario: Landed with its worktree kept
- **WHEN** `vcs.enabled` is on, the checkout's archive holds `001-a` after a hand landing, and the kept worktree on `osq/001-a` also holds `001-a` in its archive
- **THEN** `changeTrees` still returns the worktree's tree, and `listChanges` returns `001-a` once, as archived, from the checkout

#### Scenario: Rejected in both
- **WHEN** the checkout's rejected directory and a kept worktree on `osq/003-c` both hold `003-c`
- **THEN** `listChanges` returns `003-c` once, as rejected, from the checkout

### Requirement: Change location readers
The watcher loop, the baseline search, status and its next step, inbox, show,
the queue and its report detail, report and recent disclosures, the web data
and events, doctor and its price check, and the lifecycle commands `approve`,
`retry`, `reject`, `done`, and `verified` SHALL find change folders through
the change locations module. Outside it, only `layout.ts`, `foundation/new.ts`,
`spec/migrate.ts`, `spec/linter.ts`, `cli/lint.ts`, `cli/plan.ts`, and
`watcher/archiver.ts` SHALL call `getChangesDir` or `getArchiveDir`.

#### Scenario: A reader lists changes on its own
- **WHEN** any other file under `src/` calls `getChangesDir` or `getArchiveDir`
- **THEN** the structural test fails and names the file

#### Scenario: Landed change counted once
- **WHEN** a change archived in its worktree has been squashed onto the default branch by hand and committed, and the worktree is kept
- **THEN** `osq queue` shows its item as landed without an ambiguity error, and `osq status`, bare `osq --json`, `osq inbox --json`, and `osq report --json` each count the change once

### Requirement: Running change in status
`osq status` SHALL print `  worktree: <path>` under a change that runs in a
worktree, directly below its heading line. While a task of that change is
running, it SHALL print, below the worktree line,
`  warning: a task is running in this worktree; do not edit it until the task ends`.
When the checkout still holds a
folder of the same name whose authored-content hash differs from the
worktree's `.run/approved`, it SHALL print, below those lines,
`  warning: the checkout's copy of <folder> changed since approval; edits there never reach the run`.
A checkout copy that matches, or is missing, SHALL print no warning.

#### Scenario: Worktree path
- **WHEN** `osq status` runs with `vcs.enabled` and a change approved into a worktree
- **THEN** the change is listed once, as approved, followed by `  worktree: ` and the worktree path

#### Scenario: Edited checkout copy
- **WHEN** a task file in the checkout's copy of that change is edited after approval
- **THEN** status prints the checkout copy warning naming the folder

#### Scenario: Untouched checkout copy
- **WHEN** the checkout's copy is unchanged since approval
- **THEN** status prints no warning

#### Scenario: Task running in the worktree
- **WHEN** a task of a change in a worktree holds a live lock in `.run/running/`
- **THEN** status prints the running-task warning directly below the worktree line, and prints no such warning once the lock is gone

### Requirement: Leftover draft in status
With `vcs.enabled` and `GitVcs` selected, a folder directly in the project
root's changes directory, from the first `changeTrees` tree, that passes
`isActiveChangeFolderName` SHALL be a leftover draft when the default branch
holds `<archive>/<folder>/.run/approved` and the folder's `hashChangeFolder`
hash equals that file's trimmed contents. `<archive>` is the first tree's
archive directory relative to its root. `getStatusOverview` SHALL leave a
leftover draft out of `specs` and SHALL list it in `leftovers`, with its
folder name and its path relative to the project root. When `leftovers` is
not empty, `osq status` SHALL print, after the pending verifications and
before `Archived specs:`, the line `Leftover drafts:`, then one line
`  <folder>: landed; remove the checkout copy with rm -r <path>` per
leftover in folder order, then a blank line. A copy whose hash differs from
the landed approved hash SHALL NOT be a leftover. With `vcs.enabled` off or
under `NoVcs`, there SHALL be no leftovers and no git read.

#### Scenario: Leftover after a hand landing
- **WHEN** a change approved into a worktree has archived, the checkout ran `git merge --squash osq/<folder>` and `git commit`, and the checkout's copy of the folder is untouched
- **THEN** `osq status` prints `Leftover drafts:` and `  <folder>: landed; remove the checkout copy with rm -r openspec/changes/<folder>`, and does not list the folder under `Active specs:`

#### Scenario: Leftover after the worktree is removed
- **WHEN** the same landing is followed by `git worktree remove` of the change's worktree
- **THEN** status still prints the leftover line and still leaves the folder out of `Active specs:`

#### Scenario: Edited copy is not a leftover
- **WHEN** the checkout's copy was edited after approval and the change landed
- **THEN** status prints no `Leftover drafts:` section

#### Scenario: Not landed yet
- **WHEN** the change has archived on its branch and the default branch does not hold its archive
- **THEN** status prints no `Leftover drafts:` section

#### Scenario: Removing it clears the flag
- **WHEN** the printed `rm -r` command has run
- **THEN** status prints no `Leftover drafts:` section

### Requirement: Dispatch order
`orderDispatchItems(projectRoot, config, dispatch, firstSeen)` SHALL return
the items with a `weight` and a `reason` each, in dispatch order.
`firstSeen` SHALL map `dispatchIdentity` values to dates and default to an
empty map. An item's weight SHALL be one plus the number of active changes,
in any tree, whose `depends_on` reaches the item's change directly or
through other active changes. Ids SHALL match folders as `matchesFolder`
does, and a cycle SHALL count each change once. The order SHALL be:

1. When `watcherIdle` is true, `approval` and `halt` items first.
2. Then higher weight first.
3. Then items with a first-seen time before items without one, and the
   earlier first-seen time first.
4. Then lower change id, then lower task number, with a change-level item
   before its task items.

The reason SHALL join, with `; `, `watcher idle; this gives it work` when
rule 1 applies to the item and
`holds up <weight - 1> change` or `holds up <weight - 1> changes` when the
weight is above one. When neither applies, it SHALL be
`waiting since <YYYY-MM-DD HH:MM>`, the item's first-seen time in local
time, when the item has one, and `in change order` otherwise.
The same files SHALL always give the same order.

`readDispatch(projectRoot, config, home)` and
`readDispatchQueue(projectRoot, config, home)` SHALL pass
`firstSeenTimes` of `readWaitLog(projectRoot, home)`, or an empty map when
there is no log, with `home` defaulting to `os.homedir()`.

#### Scenario: Weight orders
- **WHEN** an approval item's change has three active changes depending on it, one of them through another, and another approval item's change has none
- **THEN** the first item has weight 4 and reason `holds up 3 changes` and comes first

#### Scenario: Idle watcher
- **WHEN** `watcherIdle` is true and there is a heavy `verify` item and a light `halt` item
- **THEN** the `halt` item comes first with reason `watcher idle; this gives it work`

#### Scenario: Equal items
- **WHEN** two items have the same kind group and weight
- **THEN** the lower change id comes first with reason `in change order`

#### Scenario: Dependency cycle
- **WHEN** two active changes depend on each other
- **THEN** each has weight 2

#### Scenario: First seen breaks ties
- **WHEN** two approval items have the same weight, and the wait log under the home has the higher change id first seen earlier
- **THEN** `readDispatch` with that home lists the higher change id first with reason `waiting since <YYYY-MM-DD HH:MM>` for its first-seen time

#### Scenario: Logged before unlogged
- **WHEN** only the higher change id of two equal approval items has a first-seen time
- **THEN** it comes first, and the other item's reason is `in change order`

### Requirement: Dispatch cards
`readDispatchCard(projectRoot, config, item)` SHALL return the card data
for one item:

- `approval`: the approval digest from `buildApprovalDigest`.
- `halt`: for a task, the task number and title, the dead or regressed
  reason, the number of `started` events in `.run/events/<n>.jsonl` as the
  attempt count, the last `limits.cardOutputLines` lines of the marker body,
  and the path of `.run/dead/<n>.patch` relative to the project root
  when that file exists. For a change-level regression, the reason and
  the last `limits.cardOutputLines` lines of `.run/regressed/change.md`'s
  body.
- `land`: the proposal's goal, one outcome line per task as
  `osq message` writes it, and, with `vcs.enabled`, the message
  `buildSquashMessage` builds, or its refusal message when it refuses.
- `verify`: the check command when the change has one, the after-landing
  steps from the proposal, and the verification outcome so far.

The marker lines come from files osq already writes with paths relative
to the project root, and the card SHALL NOT add an absolute path.

#### Scenario: Approval card
- **WHEN** the card is read for an approval item
- **THEN** it holds the digest's goal, capabilities, decisions, and tasks with their scopes

#### Scenario: Halt card
- **WHEN** a task died with `verify_red` after two attempts and its marker body holds verify output
- **THEN** the card has attempt count 2, reason `verify_red`, the last lines of that output, and no string that contains the project root

#### Scenario: Halt card with a patch
- **WHEN** the dead task's change left `.run/dead/<n>.patch`
- **THEN** the card names that patch by its relative path

#### Scenario: Land card
- **WHEN** a change archived in its worktree with `vcs.enabled`
- **THEN** the card holds the goal, one outcome line per task, and the squash message with `Osq-Change` among its trailers

#### Scenario: Verify card
- **WHEN** an archived change has a `check` command and after-landing steps
- **THEN** the card holds the check command and the steps

### Requirement: Inbox sound
`createInboxSound(projectRoot, config, deps)` SHALL return an object with
`notify(now: Date): void`, which plays one sound for a batch of new inbox
items. `deps` SHALL hold `platform`, `path` (the `PATH` value), `spawn`,
`bell`, `warn`, and `exists`, each defaulting to the real one, so tests make no
sound. It SHALL resolve the sound from `config.inbox.sound`:

- `off`: `notify` does nothing.
- `bell`: `notify` calls `bell`, which writes `\u0007` to stdout by default.
- `default`: the file `sounds/inbox.wav` under the package root.
- any other value: that path resolved against the project root.

For a file that does not exist, it SHALL print
`osq inbox: inbox.sound: <path> does not exist; using the bell` to stderr
once, through `deps.warn`, and `notify` SHALL call `bell`. It SHALL pick the player once: on
`darwin`, `afplay`; on `linux`, the first of `pw-play`, `paplay`, and
`aplay`; each only when an executable file of that name is in a `PATH`
directory. With no player, `notify` SHALL call `bell`. With a player,
`notify` SHALL spawn it with the file as its one argument, ignore its
output, not wait for it, and call `bell` when the spawn emits an error.

`notify` SHALL do nothing when `now`, in local time, falls in
`inbox.quietHours`: from the start time, inclusive, to the end time,
exclusive, across midnight when the start is later than the end. It SHALL
do nothing when it played less than `inbox.soundWindowSeconds` before
`now`. Nothing under `src/watcher/` or `src/harness/` SHALL import this
module.

#### Scenario: Linux player order
- **WHEN** the platform is `linux` and `PATH` holds executable `paplay` and `aplay` but no `pw-play`
- **THEN** `notify` spawns `paplay` with the package's `sounds/inbox.wav`

#### Scenario: macOS player
- **WHEN** the platform is `darwin` and `PATH` holds executable `afplay`
- **THEN** `notify` spawns `afplay` with the sound file

#### Scenario: No player
- **WHEN** no player is in `PATH`
- **THEN** `notify` calls `bell` and spawns nothing

#### Scenario: Spawn error
- **WHEN** the spawned player emits an error
- **THEN** `bell` is called

#### Scenario: Bell and off
- **WHEN** `inbox.sound` is `bell`, and then `off`
- **THEN** `notify` calls `bell` without spawning, and then does nothing

#### Scenario: Own sound file
- **WHEN** `inbox.sound` is `sounds/ping.wav` and that file exists under the project root
- **THEN** `notify` spawns the player with that file's absolute path

#### Scenario: Missing sound file
- **WHEN** `inbox.sound` names a file that does not exist
- **THEN** `createInboxSound` warns `osq inbox: inbox.sound: <path> does not exist; using the bell` once, and `notify` calls `bell` without spawning

#### Scenario: Quiet hours across midnight
- **WHEN** `inbox.quietHours` is `22:00-07:00` and `notify` runs at 23:30, 06:59, and 07:00 local time
- **THEN** only the 07:00 call plays

#### Scenario: One sound per window
- **WHEN** `inbox.soundWindowSeconds` is 5 and `notify` runs at 0, 3, and 6 seconds
- **THEN** it plays at 0 and 6 seconds only

#### Scenario: Watcher stays silent
- **WHEN** every source file under `src/watcher/` and `src/harness/` is read
- **THEN** none imports `inbox-sound` or `dispatch-follow`

### Requirement: Inbox sound file
`scripts/make-inbox-sound.mjs [out]` SHALL write a short two-tone chime as a
mono 16-bit PCM WAV file, to `out` when given and to `sounds/inbox.wav`
otherwise, computing every sample itself so the sound is original. The same
script SHALL write the same bytes every time. `sounds/inbox.wav` SHALL be
that output, at most 4096 bytes. `package.json`'s `files` SHALL include
`sounds`, so the published package holds `sounds/inbox.wav`.

#### Scenario: Regenerated file matches
- **WHEN** the script writes to a temporary path
- **THEN** the bytes equal `sounds/inbox.wav`

#### Scenario: Small WAV
- **WHEN** `sounds/inbox.wav` is read
- **THEN** it starts with `RIFF` and `WAVE`, declares one channel and 16 bits per sample, and is at most 4096 bytes

#### Scenario: Shipped
- **WHEN** `package.json` is read
- **THEN** its `files` include `sounds`

### Requirement: Dispatch follow
`followDispatch(projectRoot, config, options)` SHALL print what
`formatDispatchText` prints for the current items, then
`Waiting for new items (Ctrl-C to stop).`, and then watch the change trees
through `createInvalidationHub`, with `inbox.eventDebounceMs` as its
debounce and the injectable `watch` and `schedule` from `options`. After
each batch, it SHALL derive the items again with `readDispatchItems` and
`orderDispatchItems` and print, in order, one line per item whose kind,
change folder, and task number were not among the previous derivation's
items: `<HH:MM> + ` in local time from `options.now`, then
`formatDispatchItemSummary`'s text. It SHALL then print one line per
previous item that is no longer there, `<HH:MM> - ` and the same text as
it was last derived. When at least one `+` line printed, it SHALL call
`options.sound.notify(now)` once; a `-` line alone SHALL make no sound. Items present at start SHALL
make no sound, and an item that went away and came back SHALL count as new.

It SHALL also derive every `inbox.pollSeconds`, through `options.every`,
a repeating timer seam that defaults to `setInterval` and returns a handle
with `cancel()`. Derivations SHALL run one at a time; a batch or poll that
arrives during one SHALL cause one more derivation after it. After each derivation, it SHALL read the
trees again through `options.trees`, which defaults to `changeTrees`, and
when their `treeWatchPaths` differ from the watched paths, it SHALL close the
hub, open a new one over the new trees, and derive once more. A derivation
that throws SHALL print `osq inbox: <message>` to stderr and keep
following. When `options.signal` aborts, it SHALL close the hub, cancel
the poll timer, and resolve. It SHALL write nothing to the project.

#### Scenario: New halt
- **WHEN** following starts with one approval item, then a task dies and the watcher fires
- **THEN** one `<HH:MM> + halt ...` line prints and `notify` is called once

#### Scenario: Start makes no sound
- **WHEN** following starts with two items and the watcher fires with no state change
- **THEN** no `+` line prints and `notify` is never called

#### Scenario: Item goes away
- **WHEN** following starts with a halt item, then its dead marker is removed and the watcher fires
- **THEN** one `<HH:MM> - halt ...` line prints and `notify` is never called

#### Scenario: Poll finds an item
- **WHEN** a task dies with no watcher event and the poll timer fires
- **THEN** its `+` line prints and `notify` is called once

#### Scenario: Two items in one batch
- **WHEN** two new items appear before one batch
- **THEN** two `+` lines print in dispatch order and `notify` is called once

#### Scenario: Item comes back
- **WHEN** a dead task's marker is removed, the watcher fires, then the marker returns and the watcher fires
- **THEN** the second derivation prints the halt item again and calls `notify`

#### Scenario: Empty inbox waits
- **WHEN** following starts on a project with no items
- **THEN** it prints `Nothing needs you.` and the waiting line, and keeps running until the signal aborts

#### Scenario: New tree
- **WHEN** `options.trees` returns a second tree after the first derivation
- **THEN** the loop opens a new watcher over the new paths, closes the old one, and derives once more

### Requirement: Dispatch watch
`watchDispatch(projectRoot, config, options, onItems)` SHALL derive the
ordered dispatch items with `readDispatchItems` and `orderDispatchItems`,
with `firstSeenTimes` of `readWaitLog(projectRoot, options.home)`,
after each `createInvalidationHub` batch and every `inbox.pollSeconds`
through `options.every`, one derivation at a time, with a batch or poll
during one causing one more after it. After each derivation it SHALL call
`onItems(items, at, idle)` with the items, the clock time the derivation
started, and the dispatch's `watcherIdle`, then read the trees again through
`options.trees`, and when their `treeWatchPaths` differ from the watched
paths, close the hub, open a new one, and derive once more. A derivation
that throws SHALL call `options.stderr` with `osq inbox: <message>` and keep
watching. It SHALL take the same `watch`, `schedule`, `every`, `trees`,
`now`, and `stderr` seams as `followDispatch`, and `home`, defaulting to
`os.homedir()`, and return `{ close(): Promise<void> }`, which closes the
hub and cancels the poll. It SHALL derive once as soon as it starts.
`followDispatch` SHALL be built on it and print what it printed before.

#### Scenario: Batch derives
- **WHEN** the fake watcher fires after a task dies
- **THEN** `onItems` receives items that include the new halt item

#### Scenario: Poll derives
- **WHEN** the manual poll timer fires with no watcher event
- **THEN** `onItems` is called again

#### Scenario: Close
- **WHEN** `close()` resolves
- **THEN** the fake watcher is closed, the poll is cancelled, and `onItems` is not called again

#### Scenario: Follow unchanged
- **WHEN** `tests/inbox-follow.test.ts` runs
- **THEN** every test passes unchanged

#### Scenario: Idle and first seen
- **WHEN** the watcher has no runnable change and the wait log under `options.home` has the higher of two equal approval items first seen earlier
- **THEN** `onItems` gets `idle` true and the higher change id first

### Requirement: Card session
`runCardSession(projectRoot, config, options)` SHALL run until the reviewer
quits. `options` SHALL hold `input` (`key(): Promise<string | null>` and
`line(question): Promise<string | null>`), `launch(args): Promise<number>`,
`sound`, `stdout`, `stderr`, `now`, `signal`, `recorder`, and the watch
seams of `watchDispatch`, `home` among them. The session SHALL keep at most
one pending `key()` read.

- It SHALL derive the ordered items with the first-seen times of the wait
  log under `options.home`, put the items skipped in this session after the
  rest in the order they were skipped, and print `formatCardScreen` for the
  first item with its card from `readDispatchCard`.
- A key from `cardKeys` SHALL print `── <label> ──`, await `launch` with its
  arguments, print `── exit <code> ──`, and derive again. The reject key
  SHALL first ask `Reason: ` through `input.line`; an empty or null answer
  SHALL show the same card without launching.
- After a launch, when the item's kind, change folder, and task number are
  gone, the next first item's card SHALL show; when it is still there, its
  card SHALL show again, read afresh.
- `n` SHALL move the item behind the others for the rest of the session and
  show the next card. A skipped item that goes away SHALL leave the list.
- `q`, `\u0003`, a null key, or `signal` aborting SHALL end the session.
  Any other key SHALL be ignored.
- With no items, it SHALL print
  `Nothing needs you. Waiting for new items (q to quit).`, watch with
  `watchDispatch`, and on the first derivation with items close the watch,
  call `sound.notify(at)` once, and show the first card. `q` while waiting
  SHALL end the session.
- It SHALL never call `sound.notify` while a card is shown. It SHALL write
  nothing to the project itself; only launched commands write there. It
  SHALL record through `options.recorder` as "Wait recording" says.

#### Scenario: Approve and move on
- **WHEN** the inbox holds an approval item and a halt item, the key `a` is pressed, and the recording launcher approves the change
- **THEN** the launcher got `approve <id>`, the separators print around it, and the halt item's card shows next

#### Scenario: Item still there
- **WHEN** the launcher returns 1 and changes nothing
- **THEN** `── exit 1 ──` prints and the same card shows again

#### Scenario: Reject asks for a reason
- **WHEN** `x` is pressed on a change-level halt and the reason is `wrong approach`
- **THEN** the launcher got `reject <id> --reason` and `wrong approach` as separate arguments

#### Scenario: Skip
- **WHEN** `n` is pressed on the first of two items
- **THEN** the second item's card shows, and after `n` again the first shows

#### Scenario: Empty then an item arrives
- **WHEN** the session starts with no items, then a task dies and the fake watcher fires
- **THEN** the waiting line prints, `notify` is called once, and the halt card shows

#### Scenario: No sound on an open card
- **WHEN** a card is shown and a new item appears before the next key
- **THEN** `notify` is never called and the new item takes its place in the order after the key

#### Scenario: Quit
- **WHEN** `q` is pressed on a card, or while waiting
- **THEN** the session resolves without launching anything

### Requirement: Inbox wait log
`resolveWaitLogPath(projectRoot, home)` SHALL return
`<home>/.osq/inbox/<hash>.jsonl`, where `<hash>` is the SHA-256 hex of the
project root's real path, as `resolveLastLookPath` computes it. The log
SHALL hold one JSON object per line, each with `type`, `at` (an ISO
timestamp), and `session` (a string), and by type:

- `start`: `mode`, `cards` or `follow`.
- `seen`: `item`, `idle`, and `unobserved`.
- `opened`: `item` and `idle`.
- `gone`: `item`, `idle`, and `unobserved`.
- `top`: `item` or null, and `idle`.
- `stop`: nothing more.

`item` SHALL be `{ kind, change, task }`, with the change folder and the
task number, or null for a change-level item. `idle` SHALL be the dispatch's
`watcherIdle` when the record was written. `dispatchIdentity(item)` SHALL
join the kind, the change folder, and the task number (empty when there is
none) with `\u0000`, for dispatch items and log items alike.

`readWaitLog(projectRoot, home)` SHALL return the records in file order,
leaving out any line that does not parse as JSON or lacks a known `type`, a
string `at`, or a string `session`. It SHALL return null when the file does
not exist.

`waitEpisodes(records)` SHALL fold the records in order. A `seen` SHALL open
an episode for its identity when none is open. An `opened` SHALL set the open
episode's opened time and session when they are unset. A `gone` SHALL close
the open episode. Any other `seen`, `opened`, or `gone` SHALL be ignored.
Each episode SHALL carry its item; its seen time, session, `idle`, and
`unobserved`; its opened time and session, or null; and its gone time,
session, `idle`, and `unobserved`, or null while open.

`firstSeenTimes(records)` SHALL map the identity of every open episode to
its seen time.

#### Scenario: Path
- **WHEN** `resolveWaitLogPath` runs for a project root and for a symlink to it, with home `/h`
- **THEN** both return the same `/h/.osq/inbox/<64 hex characters>.jsonl`

#### Scenario: Episodes
- **WHEN** the records are a `seen` for halt 002 task 1, a second `seen` for it from another session, an `opened`, a `gone`, and then another `seen` for it
- **THEN** there are two episodes: the first closed, with its opened time, and the second open

#### Scenario: First seen
- **WHEN** the log holds an open episode for halt 002 task 1 and a closed one for approval 001
- **THEN** `firstSeenTimes` holds only the halt's identity, with its seen time

#### Scenario: Unreadable lines
- **WHEN** the log holds a line that is not JSON and a record without `type` between two good records
- **THEN** `readWaitLog` returns the two good records

#### Scenario: No log
- **WHEN** the project has no wait log under the home
- **THEN** `readWaitLog` returns null

### Requirement: Inbox wait recorder
`createWaitRecorder(projectRoot, mode, options)` SHALL return
`{ observe(items, idle, at), opened(item, idle, at), stop(at) }`, where
`mode` is `cards` or `follow` and `options` holds `home` and `stderr`. Each
method SHALL resolve once its records are appended to
`resolveWaitLogPath(projectRoot, options.home)`, creating the directory when
it is missing, and appends SHALL happen in call order. Every record SHALL
carry the session id: the process id and the first `observe`'s time in
milliseconds, joined with `-`.

- The first `observe` SHALL append `start` with `mode`, then read the log
  and append a `gone` with `unobserved: true` for every open episode whose
  identity is not among `items`, and a `seen` with `unobserved: true` for
  every item with no open episode.
- A later `observe` SHALL append a `seen` with `unobserved: false` for every
  item that was not among the previous `observe`'s items, then a `gone` with
  `unobserved: false` for every previous item no longer among `items`.
- Every `observe` SHALL then append `top` with the first item, or null, and
  `idle`, when that pair differs from the last `top` this recorder appended.
- `opened` SHALL append `opened`. `stop` SHALL append `stop` when `start`
  was appended, and nothing otherwise.
- Every record an `observe` appends SHALL carry its `at` and `idle`.
- A failed append SHALL call `options.stderr` with
  `osq inbox: wait log: <message>` once per recorder, and no method SHALL
  reject.

#### Scenario: First observe
- **WHEN** the log holds an open episode for an item that is gone, and the first `observe` gets one new approval item
- **THEN** it appends `start`, a `gone` for the old item and a `seen` for the approval, both with `unobserved: true`, and a `top` naming the approval

#### Scenario: Later observe
- **WHEN** a second `observe` gets a halt item in place of the approval
- **THEN** it appends a `seen` for the halt and a `gone` for the approval, both with `unobserved: false`, and a `top` naming the halt

#### Scenario: Same top
- **WHEN** a third `observe` gets the same items and the same `idle`
- **THEN** it appends nothing

#### Scenario: Stop without start
- **WHEN** `stop` is called before any `observe`
- **THEN** no log file exists

#### Scenario: Unwritable home
- **WHEN** the home is a regular file and `observe` is called twice
- **THEN** both calls resolve and `stderr` got one `osq inbox: wait log: ` line

### Requirement: Wait recording
`runCardSession` and `followDispatch` SHALL take an optional `recorder`,
with the methods `createWaitRecorder` returns, and record nothing without
one.

- The card session SHALL call `recorder.observe(items, idle, at)` after
  every derivation, its own and the watch's, with the ordered items after
  the set-aside ones are moved behind, the dispatch's `watcherIdle`, and the
  time the derivation started from `options.now`. It SHALL call
  `recorder.opened(item, idle, at)` each time it prints a card, and
  `recorder.stop(at)` when it ends.
- `followDispatch` SHALL call `recorder.observe` with the items it prints
  at start and after every derivation, and `recorder.stop(at)` when
  `signal` aborts.

#### Scenario: Approve recorded
- **WHEN** a card session with a recorder under a temporary home starts on an approval item and a halt item, `a` approves the change, and `q` quits
- **THEN** the log holds, in order, `start`, a `seen` for each item, `top` for the approval, `opened` for the approval, `gone` for the approval, `top` for the halt, `opened` for the halt, and `stop`

#### Scenario: Follow recorded
- **WHEN** `followDispatch` with a recorder starts on an empty inbox, a task dies, the fake watcher fires, and the signal aborts
- **THEN** the log holds `start`, `top` with a null item, a `seen` for the halt with `unobserved: false`, `top` for the halt, and `stop`

#### Scenario: No recorder
- **WHEN** a card session runs without a recorder
- **THEN** nothing is written under the home

### Requirement: Last sync in status
For a change that runs in a worktree, `getStatusOverview` SHALL read the
change folder's `.run/events/change.jsonl` and carry its last `synced` event in
that change's `worktrees` entry as `lastSync`, holding the event's
`timestamp` and its data's `defaultBranch` and `commits`. When the file's last
`sync_stopped` event comes after its last `synced` event, or there is no
`synced` event, it SHALL also carry that event as `lastSyncStop`, holding its
`timestamp` and its data's `reason` and `message`. It SHALL skip lines that do
not parse, and leave out each field whose event does not exist.

`osq status` SHALL print `  last sync: <timestamp>, <n> commits from <default
branch>`, with `commit` when `<n>` is 1, then `  sync stopped: <timestamp>
(<reason>); run osq sync <id> again once it is fixed` when `lastSyncStop` is
set, then the first line of the stop's message on the next line, indented four
spaces. These lines go below the change's worktree line and its warnings and
above its `next:` line. A change without either field SHALL print no such
line.

#### Scenario: Last of several syncs
- **WHEN** a change in a worktree has two `synced` events, the second at `2026-09-29T10:00:00.000Z` with `defaultBranch` `main` and `commits` 1
- **THEN** status prints `  last sync: 2026-09-29T10:00:00.000Z, 1 commit from main` once, directly above the change's `next:` line

#### Scenario: Never synced
- **WHEN** a change in a worktree has no `synced` or `sync_stopped` event
- **THEN** status prints no `last sync:` or `sync stopped:` line, and the overview's `worktrees` entry has neither `lastSync` nor `lastSyncStop`

#### Scenario: Broken line
- **WHEN** the change's `.run/events/change.jsonl` holds a line that is not JSON before a `synced` event
- **THEN** status prints the last sync from that event

#### Scenario: Stopped after the last sync
- **WHEN** a change has a `synced` event, then a `sync_stopped` event at `2026-09-29T11:00:00.000Z` with reason `sync_conflict` and a message naming `src/app.txt`
- **THEN** status prints the `last sync:` line, then `  sync stopped: 2026-09-29T11:00:00.000Z (sync_conflict); run osq sync <id> again once it is fixed`, then the message's first line indented four spaces

#### Scenario: Stop cleared by a later sync
- **WHEN** a change has a `sync_stopped` event followed by a `synced` event
- **THEN** status prints only the `last sync:` line, and the overview has no `lastSyncStop`
