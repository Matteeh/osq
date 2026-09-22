# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Managed tool-native planning entry points
<!-- source: src/core/init.ts, src/core/doctor.ts, templates/**, AGENTS.md, PLANNER.md, .claude/commands/osq-plan.md, tests/init-planning-entrypoints.test.ts, tests/doctor-planning-entrypoints.test.ts -->
`osq init` SHALL manage `.claude/commands/osq-plan.md`, taking the change slug
as its argument, and a `Planning a change` section inside the existing osq block
in `AGENTS.md`. The Claude command SHALL use the existing osq start/end markers.
Both entry points SHALL direct the tool to read and follow `plan-prompt.md` in
the change folder, write only inside that folder, run `osq lint <slug>` and fix
every finding, and never run `osq approve`.

The managed `PLANNER.md` template SHALL state the same read, write-boundary,
lint, and no-approval rules in its own wording. Repeated initialization SHALL
refresh stale osq-managed bytes while preserving all content outside osq
markers and all unrelated existing files. AGY SHALL use the shared AGENTS block
unless a separate project-instruction contract is confirmed.

`osq doctor` SHALL require both the Claude command and AGENTS planning section
to be present and current, reporting an actionable managed-instructions failure
for missing, malformed, or stale content.

#### Scenario: Existing repository gains planning entry points
- **WHEN** `osq init` runs in an existing repository without the managed planning entry points
- **THEN** it installs current Claude and Codex instructions without changing unrelated files or content outside osq markers

#### Scenario: Managed planning content drifts
- **WHEN** either entry point is missing or differs from the installed osq content
- **THEN** doctor fails its managed-instructions check and a repeated init repairs the drift

## MODIFIED Requirements

### Requirement: Interactive planning command
<!-- source: src/cli/plan.ts, src/cli/plan-queue.ts, src/cli/index.ts, src/core/report.ts, tests/plan-handoff.test.ts -->
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules.

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

### Requirement: Capability-driven planner validation
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/cli/plan.ts, tests/config-planner-catalog.test.ts, tests/plan-handoff.test.ts -->
Planner configuration SHALL remain optional and SHALL be resolved, validated,
and required only for an explicit `--session` planning path. Session selection
SHALL use explicit planner configuration when present and otherwise the
selected executor's catalog entry without borrowing another harness's model,
effort, or agent. Default prompt handoff and print mode SHALL not resolve a
planner or use configuration to attribute a brief or manifest.

Generated configuration and consumer guidance SHALL say that model choice for
planning belongs to the tool in which the author plans unless osq is explicitly
asked to launch the session.

#### Scenario: Supported planner configuration
- **WHEN** `--session` uses planner settings supported by the selected catalog entry
- **THEN** validation returns normalized configuration and the session uses that harness's model and agent selection

#### Scenario: Unsupported planner setting
- **WHEN** `--session` supplies an optional setting unsupported by its selected harness
- **THEN** validation fails with an error naming the harness and unsupported setting

#### Scenario: Implicit planner selection
- **WHEN** `--session` is requested without a planner block
- **THEN** planning uses the selected executor's planner capabilities without borrowing settings from another harness

#### Scenario: Default handoff has no planner configuration
- **WHEN** an author prepares or prints a prompt without a planner block
- **THEN** planning succeeds without model selection and the default brief attribution is null

#### Scenario: Session uses planner configuration
- **WHEN** an author requests `--session`
- **THEN** supported planner settings are validated and selected through the canonical harness catalog before launch
