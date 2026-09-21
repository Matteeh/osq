---
title: Brief queue
depends_on: ["035", "036"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - status-inspection
    - metrics-and-reporting
    - watcher-and-harness
---
## Goal

Turn the human-authored `openspec/queue.md` into a read-only planning queue that
derives progress from change folders, prepares exactly one eligible change per
invocation, preserves the existing human approval gate, halts on unresolved
execution failures, limits recorded planning spend, and exposes queue progress
in delivery reports while keeping each new queue, configuration, and planning
module within the repository source-line budget.

## Verify

`pnpm verify`

The suite includes a three-item temporary fixture using the mock harness and
real CLI entrypoint. It drives `plan --next --print`, `approve`, and
`watch --once`, asserts queue state after every transition, and proves that an
active dead or regressed task prevents another item from being planned until
`retry`.

## Non-goals

- Automatic planning from the watcher or any `autoplan` setting.
- Planning more than one item per `plan --next` invocation.
- Approving a planned change or weakening the existing human approval gate.
- Per-item harness, model, agent, or planning-limit configuration.
- GitHub, tracker, network, or cross-repository queue integration.
- Writing, reordering, or otherwise modifying `openspec/queue.md`.
- Treating rejection as deletion or allowing rejected dependencies to count as landed.
- Grandfathering new oversized source modules or weakening the source-line budget test.

## Contract

### Requirement: Read-only queue artifact

The queue SHALL be read exclusively from `openspec/queue.md`. Each item SHALL
begin with `## [slug] Title`, followed by one `Depends on:` line containing
comma-separated queue slugs or the literal `nothing`, followed by the brief
body. Slugs SHALL be unique, and dependencies SHALL name earlier queue items.
Malformed headings, duplicate slugs, missing dependency lines, or unknown
dependencies SHALL produce an actionable error before any change folder is
created.

The item order SHALL be file order. osq SHALL never write, normalize, or
reformat the queue file.

Each item SHALL have a `sha256:` hash derived deterministically from its
complete raw section. Queue-created `brief.md` files SHALL record the slug and
hash as `queue_item` and `queue_hash` frontmatter.

#### Scenario: Valid queue
- **WHEN** `openspec/queue.md` contains ordered, well-formed sections
- **THEN** osq returns the items in file order with their titles, dependencies, brief bodies, and deterministic section hashes

#### Scenario: Invalid queue
- **WHEN** queue syntax, slug uniqueness, or dependency references are invalid
- **THEN** queue inspection and next-item planning fail without writing the queue or creating a change

### Requirement: Filesystem-derived queue state

`osq queue` SHALL print every current queue item in file order. Associations
SHALL come only from `queue_item` metadata in `brief.md` files under active,
archived, and rejected change directories.

An item SHALL derive as `landed` when an associated change is archived; `dead`
when its active associated change has a dead or regressed task or change-level
regression; `running` when its active associated change derives as running;
`approved` when its active associated change is approved but neither running
nor failed; `planned` when its active associated change is unapproved;
`rejected` when it has rejected attempts but no active or archived association;
and `unplanned` when it has no association.

Every associated state SHALL show its change identifier. Rejected state SHALL
show the retained rejection count. A replanned active item SHALL retain its
rejected count while displaying its active state. Unlanded dependencies SHALL
be shown without replacing the item's primary state.

If the current section hash differs from the associated change's recorded
`queue_hash`, the item SHALL be annotated `changed since planned`. State and
drift SHALL be derived afresh on every invocation.

#### Scenario: Mixed queue history
- **WHEN** queue items have unplanned, active, archived, and rejected associations
- **THEN** `osq queue` shows every item once with deterministic state, change identity, rejection count, dependency readiness, and drift annotation

### Requirement: One eligible item enters planning

`osq plan --next` SHALL select the first queue item in file order that is
unplanned and whose dependencies are all landed. Items already active or
landed SHALL be skipped. Exactly one item SHALL be prepared per invocation.

The new folder SHALL use the next numeric change identifier and the queue slug,
with numbering considering active, archived, and rejected folders. Its proposal
title SHALL use the queue title, and its `depends_on` values SHALL be the numeric
identifiers of the archived changes associated with the item's queue
dependencies.

The command SHALL write the queue brief body through the existing brief
formatting path, adding `queue_item`, `queue_hash`, planner, and date metadata.
It SHALL then use the existing planner selection, prompt construction,
interactive launch, print behavior, and planning telemetry. `--print` SHALL
create the change and print the prompt without launching a process or recording
a planning session.

The planner SHALL receive the selected item and the archive paths of its landed
dependencies, not later queue items or the complete queue file.

#### Scenario: First eligible item
- **WHEN** multiple items exist but only a later unplanned item has all dependencies landed
- **THEN** one change using that item's slug, title, dependency identifiers, body, and queue metadata is created and no other item is changed

#### Scenario: Nothing eligible
- **WHEN** every item is landed, already active, rejected without replan permission, or waiting on an unlanded dependency
- **THEN** the command explains why nothing can be planned and creates no folder

### Requirement: Failure and rejection gates

Before selecting an item, `osq plan --next` SHALL inspect every active
queue-associated change. Any active dead or regressed task or change-level
regression SHALL halt the queue before mutation. The error SHALL identify the
change and target and print the applicable
`osq retry <id> <task|change>` command.

A rejected item SHALL remain rejected. When it is the first otherwise eligible
item, planning SHALL refuse unless `--replan` is supplied. With `--replan`, one
new active change SHALL be created while every rejected folder and reason
remains intact.

#### Scenario: Active queue failure
- **WHEN** any queue-associated active change contains an active dead or regressed marker
- **THEN** no item is planned and the command names the failed target and exact retry command

#### Scenario: Rejected item
- **WHEN** the first otherwise eligible item has rejected history
- **THEN** planning refuses without `--replan`, while `--replan` creates one new attempt without deleting rejected history

### Requirement: Queue planning ceilings

Configuration SHALL accept non-negative finite
`queue.maxPlanningSessions` and `queue.maxPlanningCost`. Both values SHALL be
required before a non-print `plan --next` invocation launches a planner.

Planning-session count SHALL be the number of valid `plan_started` records
across every active, archived, and rejected queue-associated change. Planning
SHALL refuse when another session would exceed `maxPlanningSessions`.

Recorded cost SHALL be the sum of finite cost fields from correlated planning
sessions. Cost coverage is complete only when every counted session has a
correlated exit record with a finite recorded cost. When coverage is complete,
planning SHALL refuse once recorded cost has reached `maxPlanningCost`. When
coverage is incomplete, the cost ceiling SHALL be ignored and the command
SHALL print a note explaining that recorded cost is incomplete; the session
ceiling remains enforced.

#### Scenario: Session ceiling
- **WHEN** launching another planner would exceed the configured session maximum
- **THEN** `plan --next` refuses before creating or launching anything

#### Scenario: Complete cost coverage
- **WHEN** all counted sessions report cost and their total has reached the configured maximum
- **THEN** `plan --next` refuses before creating or launching anything

#### Scenario: Incomplete cost coverage
- **WHEN** at least one counted session lacks recorded cost
- **THEN** the cost limit is not applied, an explanatory note is printed, and the session limit is still enforced

### Requirement: Queue report view

`osq report` SHALL add a stable top-level `queue` view in text and JSON output.
It SHALL report whether a queue is configured, landed items out of total items,
planning-session count, recorded planning cost and cost coverage, and one row
per item in queue order.

Each item row SHALL include slug, title, derived state, associated change when
present, rejection count, drift status, and nullable planned-to-landed wall
seconds. Wall time SHALL use the earliest valid `plan_started` timestamp for
the item and the valid archived event timestamp, without filesystem-time
inference.

The view SHALL list active dead and regressed targets with their recorded
reasons and every retained rejection with its change, reason, and timestamp.
Malformed or missing telemetry SHALL produce null duration or unavailable
reason fields without preventing the rest of the report.

#### Scenario: Queue delivery history
- **WHEN** queue items include landed, failed, and rejected attempts
- **THEN** text and JSON reports show progress, planning spend, per-item wall time where covered, and deterministic failure and rejection details

#### Scenario: Repository without a queue
- **WHEN** `openspec/queue.md` does not exist
- **THEN** the report exposes an unconfigured empty queue view without changing existing non-queue metrics

### Requirement: Queue source decomposition

Queue parsing, filesystem state projection, planning selection and spend,
queue-specific configuration validation, planning-command queue orchestration,
and report-only queue derivation SHALL live in cohesive source modules that
pass the repository source-line budget. `src/core/queue.ts` SHALL remain the
stable public facade for the established queue API so existing CLI and test
imports do not change.

The decomposition SHALL preserve all behavior and types established by this
change, SHALL NOT modify the source-line allow list, and SHALL keep report-only
logic out of the parsing, state, and planning modules.

#### Scenario: Queue implementation reaches the source budget
- **WHEN** queue planning and reporting are complete
- **THEN** the source-line budget and every queue, configuration, planning, and report regression test pass without a new allow-list entry

## Human steps

- This approved change was amended after tasks 1-3 exposed overlapping scopes and new source-line violations. Review task 4, the narrowed task 5, and the updated status-inspection delta.
- Run `pnpm osq approve 039` again to seal the amended folder, then retry the active regression. Neither planner nor executor approves or retries the change.

## Delta

- `specs/cli-foundation/spec.md`: queue configuration, `osq queue`, and the `plan --next`/`--replan` command contract across bounded CLI and configuration modules.
- `specs/status-inspection/spec.md`: queue parsing, association, state derivation, dependency readiness, rejection counts, section drift, and queue module boundaries.
- `specs/metrics-and-reporting/spec.md`: queue progress, planning spend, per-item elapsed time, and failure/rejection reporting.
