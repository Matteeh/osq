# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planning price diagnostics
<!-- source: src/core/foundation/doctor-prices.ts, src/core/foundation/doctor.ts, src/core/report/planning-price-gaps.ts, tests/planning-price-gaps.test.ts -->
`osq doctor` SHALL add a `planning-prices` check only when a model named by the
`plan_started` record of a planning session with recorded tokens, in any active
or archived change, has no `planning.prices` entry. The check SHALL pass with a
warning and name each missing key exactly, such as
`planning.prices["claude-opus-5-5"]`, in sorted model order. With no such model
the check list SHALL be unchanged.

#### Scenario: Missing price entry
- **WHEN** an archived change recorded planning tokens from `claude-opus-5-5` and `planning.prices` has no entry for it
- **THEN** doctor prints a `[warn]` `planning-prices` line naming `planning.prices["claude-opus-5-5"]` and still exits zero

#### Scenario: Every model priced
- **WHEN** every model with recorded planning tokens has a price entry, or none recorded tokens
- **THEN** doctor prints no `planning-prices` line

## MODIFIED Requirements

### Requirement: Executor protocol constants and result headings
<!-- source: src/core/foundation/init-blocks.ts, AGENTS.md, .opencode/agent/osq-coder.md, tests/managed-blocks.test.ts -->
The step lines of the managed `## Executing a task` section and the body lines
of `## Exiting` SHALL be exported constants in
`src/core/foundation/init-blocks.ts`, and `MANAGED_AGENTS_MD_BODY` SHALL be
assembled from them. `## Exiting` SHALL name the result headings `## Changed`,
`## Deviated`, `## Missing context`, `## Outside scope`, and `## Next` in that
order, tell the executor to leave out empty ones, and require a final `Touched:`
line listing every changed file other than the result file. Each disclosure
heading's purpose SHALL name who reads it: `## Deviated` is what the executor
did differently from the task, for the reviewer; `## Missing context` is what
the task lacked, for the planner; `## Outside scope` is what the executor found
broken outside its scope and left alone, for the human.

#### Scenario: Result headings defined once
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains every exported executor step line and every exported exit line verbatim, and the exit lines name `## Changed`, `## Deviated`, `## Missing context`, `## Outside scope`, `## Next`, and `Touched:`

#### Scenario: Repository copies stay current
- **WHEN** the managed block in the repository's `AGENTS.md` or `.opencode/agent/osq-coder.md` is inspected
- **THEN** it equals `MANAGED_AGENTS_MD_BODY`

#### Scenario: Disclosure headings name their reader
- **WHEN** the exit lines are inspected
- **THEN** `## Deviated` names the reviewer, `## Missing context` names the planner, and `## Outside scope` names the human

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/plan-queue.ts, src/cli/index.ts, src/core/report.ts, src/core/report/recent-disclosures.ts, tests/plan-handoff.test.ts, tests/plan-disclosures.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules. When the recent archived
changes hold any executor disclosure, every mode SHALL add a sixth section,
`## Recent executor disclosures`, after the record.

Without `--session` or `--print`, planning SHALL create `plan-prompt.md` from
those exact prompt bytes, record `planner: null` in brief frontmatter, avoid
constructing or spawning a harness adapter, and print one line containing the
folder path and `ask your planning tool to plan change <slug>`. Queue item
selection, dependency projection, hashes, replanning, and halt rules SHALL stay
unchanged.

`--session` SHALL preserve the existing planner selection, brief attribution,
interactive process, and owned telemetry behavior. `--print` SHALL emit the
same prompt exclusively to stdout without writing `plan-prompt.md`, launching a
process, or recording telemetry.

#### Scenario: New change interactive planning session
- **WHEN** a user executes `osq plan <name> --session` with a usable brief
- **THEN** the system creates the change and brief, builds the five ordered prompt sections, and spawns the selected interactive planner

#### Scenario: Resuming existing change planning session
- **WHEN** a user executes `osq plan <id> --session` on an existing change with `brief.md`
- **THEN** the system reuses the folder and launches a fresh interactive session with the same five-section prompt contract

#### Scenario: Small repository record
- **WHEN** fewer than five measured tasks exist in the recent archive window
- **THEN** every planning mode keeps the established record-too-small fifth section and contains no partial repository record

#### Scenario: Ordinary prompt handoff
- **WHEN** a user executes `osq plan <name> --brief <file>` in the default mode
- **THEN** the change contains a null-attributed brief and complete prompt file, stdout gives the one-line handoff, and no harness or planning record is created

#### Scenario: Queue prompt handoff
- **WHEN** a user executes `osq plan --next` with an eligible item
- **THEN** exactly that item becomes planned through the existing queue semantics and receives the same prompt-file handoff

#### Scenario: Explicit osq-owned session
- **WHEN** either planning form includes `--session`
- **THEN** the configured interactive planner, model-attributed brief, and lifecycle telemetry behave as before

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** either planning form includes `--print`
- **THEN** the complete five-section prompt is written exclusively to stdout without a prompt file, interactive process, or telemetry

#### Scenario: Disclosures section
- **WHEN** a recent archived change's result file holds a real disclosure section
- **THEN** every planning mode's prompt ends with `## Recent executor disclosures` after the repository record, and a prompt without disclosures is unchanged

### Requirement: Next queue item planning
<!-- source: src/cli/plan.ts, src/cli/plan-queue.ts, src/cli/index.ts, src/core/foundation/new.ts, src/core/status/queue-planning.ts, src/core/status/queue-state.ts, tests/queue-plan.test.ts, tests/queue-watch.test.ts, tests/fixes-declaration.test.ts -->
The planning command SHALL accept either ordinary `osq plan <name>` behavior or
`osq plan --next [--replan] [--print]`. Next mode SHALL select exactly the first
unplanned queue item in file order whose queue dependencies and fixed items are
landed, create one numerically identified folder using the queue slug, seed its
proposal title, numeric archived dependency ids, and the numeric archived ids of
the items it fixes as `fixes`, and write the item body to `brief.md` with
`queue_item` and `queue_hash` metadata before entering the existing planning
flow. A proposal seeded without fixes SHALL carry no `fixes` key.

Numeric allocation SHALL consider active, archived, and rejected folders.
Print mode SHALL create the change and emit the prompt without launching a
planner or recording a planning session. The planner context SHALL identify
the selected item and landed dependency archive paths without exposing later
queue items or the complete queue file.

#### Scenario: One eligible item
- **WHEN** `plan --next` finds an unplanned item whose dependencies are landed
- **THEN** exactly one correctly named and seeded change enters the same print or interactive flow as ordinary planning

#### Scenario: No eligible item
- **WHEN** every queue item is active, landed, rejected without replan permission, or waiting on an unlanded dependency
- **THEN** planning explains why nothing is eligible and creates no change

#### Scenario: Item that fixes a landed item
- **WHEN** the selected item carries `Fixes: first-item` and `first-item` landed as change 007
- **THEN** the new proposal's frontmatter carries `fixes: ["007"]`

#### Scenario: Fixed item not landed
- **WHEN** an item's `Fixes:` names an item that has not landed
- **THEN** the item waits as it would on an unlanded dependency and the queue lists the fixed slug among its unmet dependencies
