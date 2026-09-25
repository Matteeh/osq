# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Governing decisions in the manifest
<!-- source: src/core/run/manifest.ts, tests/instructions-drift.test.ts -->
The approval manifest SHALL carry `decisions`, an object from the number of
each accepted ADR that governs the change to the `sha256:<hex>` hash of its
file content. An approval with no governing ADR SHALL record an empty object.
A planning-only manifest SHALL omit the field.

#### Scenario: Governing ADR recorded
- **WHEN** accepted ADR 009 applies to a capability the change writes and the change is approved
- **THEN** the manifest's `decisions` maps `009` to the hash of ADR 009's file

### Requirement: Instructions changed after approval
<!-- source: src/watcher/instructions-drift.ts, src/watcher/spawn.ts, src/harness/types.ts, tests/instructions-drift.test.ts -->
Before a task's first attempt spawns, the watcher SHALL compare the current
AGENTS.md hash with the manifest's `hashes["AGENTS.md"]` and, when the manifest
has `decisions`, the current governing ADR set and hashes with it. When either
differs, it SHALL append one `instructions_changed` event to the task stream
with `data.changed`, a list holding `AGENTS.md` when that file changed and
`ADR <number> added`, `ADR <number> changed`, or `ADR <number> removed` for
each ADR difference in number order, and print one warning line
`task <n>: instructions changed after approval: <changed joined by ", ">`. The
task SHALL still run. The check SHALL do nothing for a later attempt, for a
manifest without `approvedAt`, or when the task stream already holds an
`instructions_changed` event.

#### Scenario: AGENTS.md edited after approval
- **WHEN** AGENTS.md changes between approval and task 1's first attempt
- **THEN** task 1's stream gains one `instructions_changed` event with `changed: ["AGENTS.md"]`, one warning line prints, and the agent still spawns

#### Scenario: New ADR accepted after approval
- **WHEN** an accepted ADR for a capability the change writes is added after approval
- **THEN** the event's `changed` holds `ADR <number> added` and the task still runs

#### Scenario: Nothing changed
- **WHEN** AGENTS.md and the governing ADRs match the approval
- **THEN** no `instructions_changed` event is appended and no warning prints
