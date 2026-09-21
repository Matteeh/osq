# Spec Delta: Status Inspection

## ADDED Requirements

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
<!-- source: src/core/queue.ts, tests/queue.test.ts -->
The system SHALL parse ordered items only from `openspec/queue.md`. Each item
SHALL consist of a unique `## [slug] Title` heading, one `Depends on:` line
naming comma-separated earlier slugs or `nothing`, and a non-empty brief body.
Invalid headings, slugs, titles, bodies, dependency lines, duplicate values,
and unknown, self, or forward dependencies SHALL be rejected with queue and
item context before mutation.

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

### Requirement: Brief queue state projection
<!-- source: src/core/queue.ts, src/cli/queue.ts, tests/queue.test.ts -->
Queue state SHALL be derived afresh from `queue_item` and `queue_hash` metadata
in active, archived, and rejected change briefs plus canonical task markers.
Unrelated folders SHALL not associate by name alone.

An archived association SHALL derive as landed. An active association SHALL
derive as dead for dead or regressed state, running for running state, approved
for any other approved state, and planned when unapproved. Rejected history
without an active or archived association SHALL derive as rejected; no
association SHALL derive as unplanned. Rows SHALL include the selected change
id, all retained rejection attempts, unmet queue dependencies, and a changed
since planned annotation when the selected association's recorded section hash
does not equal the current section hash.

Only an archived queue association SHALL satisfy a queue dependency. Rejected,
done-but-unarchived, manually name-matched, and missing associations SHALL not
land an item. Ambiguous multiple active or archived associations SHALL be
reported rather than silently selected.

#### Scenario: Mixed queue lifecycle
- **WHEN** current queue items have active, archived, rejected, and absent associations
- **THEN** every item receives one deterministic state plus change, rejection, dependency, and drift details

#### Scenario: Queue section changes after planning
- **WHEN** a current raw section hash differs from its associated brief's `queue_hash`
- **THEN** inspection reports changed since planned without rewriting or changing the state of the associated change

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/status.ts, src/core/show.ts, src/core/state.ts, src/core/layout.ts, src/core/inbox.ts, src/core/queue*.ts, tests/queue*.test.ts -->
The Status Inspection capability SHALL own execution queue overview formatting,
detailed change inspection, state derivation, rejected-change presentation,
runtime dependency completion resolution, human attention projection, and
read-only brief queue parsing and state projection.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for status, inbox, or brief queue inspection
- **THEN** system maps `src/core/status.ts`, `src/core/show.ts`, `src/core/state.ts`, `src/core/layout.ts`, `src/core/inbox.ts`, `src/core/queue*.ts`, and `tests/queue*.test.ts` to status-inspection
