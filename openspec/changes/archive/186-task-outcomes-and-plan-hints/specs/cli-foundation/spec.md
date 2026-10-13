## MODIFIED Requirements

### Requirement: Interactive planning command
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules. When the archive holds
enough task history, as metrics-and-reporting "What history says in the plan
prompt" defines, every mode SHALL add `## What history says` after the record.
When the recent archived changes hold any executor disclosure, every mode
SHALL add `## Recent executor disclosures` after those, as the last section.

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
