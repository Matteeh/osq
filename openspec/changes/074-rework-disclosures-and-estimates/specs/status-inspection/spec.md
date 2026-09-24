# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Task disclosure inspection
<!-- source: src/core/status/show.ts, src/core/report/result-sections.ts, tests/disclosures-inbox-show.test.ts -->
For each task whose result file has a real `## Deviated`, `## Missing context`,
or `## Outside scope` section, `osq show <id>` SHALL print one
`Disclosures: <names>` line in the task's entry naming those sections in that
order. A task without one SHALL print no such line.

#### Scenario: Task with disclosures
- **WHEN** a task's result file has a real `## Deviated` section and an `## Outside scope` section, and its `## Missing context` says `None`
- **THEN** its entry prints `Disclosures: deviated, outside scope`

## MODIFIED Requirements

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

### Requirement: Stable inbox object
<!-- source: src/core/status/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/inbox-stuck.test.ts, tests/disclosures-inbox-show.test.ts -->
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `approval`, `task-dead`,
`task-regressed`, or `change-regressed`; only task kinds SHALL carry
`task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. A running item SHALL
contain `change`, `task`, numeric `pid`, ISO `startedAt`, integer non-negative
`elapsedSeconds`, and `command`. A landed item SHALL contain `change`, ISO
`archivedAt`, and `command`. A landed item whose tasks disclosed anything SHALL
also carry `disclosures: { deviated, missingContext, outsideScope }`, the
number of tasks with each real section; no other landed item carries
`disclosures`. Empty groups SHALL be empty arrays and JSON output SHALL contain
no additional prose or metadata.

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
