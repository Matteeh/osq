# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: OpenSpec agent documentation and managed instructions block
<!-- source: src/core/foundation/init-blocks.ts, README.md, AGENTS.md, tests/managed-blocks.test.ts, tests/init.test.ts -->
The project documentation and managed `AGENTS.md` block SHALL describe the OpenSpec layout and execution protocol, SHALL NOT reference retired paths (`features/`, `specs/`, or `drift against features`), and SHALL preserve foreign OpenSpec blocks during setup.
The managed block SHALL be written for the executor. Its `## Executing a task`
section SHALL state the read order, the too-big exit, reading a prior result,
tests before code, the write boundary with the task's `scope` authoritative over
any injected ownership rule, that a preexisting test may change only with
`tests.modify: true` and the file inside `scope`, and that the executor runs the
task's `verify` and then the proposal's `verify` before exiting. The block
SHALL name the approval gate and the verification gate and SHALL carry no
planner rules beyond its `## Planning a change` section.

#### Scenario: Managed block contains no retired paths
- **WHEN** `AGENTS.md` or `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** neither contains references to `features/`, `specs/`, or `drift against features`

#### Scenario: Foreign OpenSpec block preserved during setup
- **WHEN** `osq setup` executes against an `AGENTS.md` containing an OpenSpec managed block
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged

#### Scenario: Executor protocol names the gates that kill a task
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains `## Executing a task`, `tests.modify: true`, the instruction to run the proposal's `verify` after the task's, and the statement that the task's `scope` wins over any other ownership rule

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/foundation/init-blocks.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and
`src/core/foundation/init-blocks.ts` SHALL encode slicing, detail, file tool,
change-level verify, final-tree verification, and task file-ownership rules.
Every task verify SHALL exercise its complete slice through a real entrypoint
and remain safely re-runnable against the final tree of the completed change.
A file SHALL belong to one task unless a later task must extend it; that later
task SHALL be ordered after the first owner and the proposal SHALL identify the
shared file.
The block SHALL state interactive planning and the `osq plan` handoff as
separate modes sharing the write-boundary, lint, and no-approval rules. It SHALL
state that the watcher runs the change-level `verify` after every task, so tasks
that pass only together are one task; that a later task changing an earlier done
task's resolved `scope` halts the change until a human runs `osq retry`, and
globs resolve again at every audit; that a preexisting test changes only with
`tests.modify: true` and the file in `scope`; and that `osq lint` enforces the
configured limits on scope patterns and acceptance lines.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires complete real-entrypoint and final-tree verifies, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires single-task file ownership with ordered documented extensions, requires file tool usage, and places change-level verify immediately after the goal

#### Scenario: Managed block encodes between-task watcher rules
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** its task rules state the change-level verify after every task, the scope-overlap halt resolved by `osq retry`, glob re-resolution, and the `tests.modify` rule

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between the `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/foundation/init-blocks.ts`

### Requirement: Managed tool-native planning entry points
<!-- source: src/core/foundation/init-blocks.ts, src/core/foundation/init.ts, src/core/foundation/doctor-managed.ts, templates/**, AGENTS.md, PLANNER.md, .claude/commands/osq-plan.md, tests/init.test.ts, tests/managed-blocks.test.ts -->
`osq init` SHALL manage `.claude/commands/osq-plan.md`, taking the change slug
as its argument, and a `Planning a change` section inside the existing osq block
in `AGENTS.md`. The Claude command SHALL use the existing osq start/end markers.
The Claude command SHALL direct the tool to read and follow `plan-prompt.md` in
the change folder. The `AGENTS.md` planning section SHALL direct planners to
`PLANNER.md` and SHALL name `plan-prompt.md` in the change folder as the
complete prompt when `osq plan` started the session. Both entry points SHALL
direct the tool to write only inside that folder, run `osq lint <slug>` and fix
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

#### Scenario: Planner reaches AGENTS.md without a handoff
- **WHEN** a planner reads the `AGENTS.md` planning section in an interactive session
- **THEN** it is sent to `PLANNER.md`, and `plan-prompt.md` is named only for sessions `osq plan` started

## ADDED Requirements

### Requirement: Proposal seed template
<!-- source: templates/proposal.md, src/core/foundation/new.ts, tests/new.test.ts -->
`osq new` SHALL seed `proposal.md` with the planning sentinel `verify` in
frontmatter and the body sections `## Goal`, `## Verify`, `## Non-goals`,
`## Contract`, `## Human steps`, and `## Delta`, in that order. The contract
placeholder SHALL be a `### Requirement:` block with a `#### Scenario:`, not a
table. The seed SHALL NOT mention retired `features.writes`. The built-in
fallback used when the template file is unreadable SHALL carry the same
sections.

#### Scenario: New change proposal
- **WHEN** `osq new <name>` creates a change
- **THEN** its `proposal.md` has the six sections in order, a requirement-and-scenario contract placeholder, and `verify: node -e "process.exit(0)"` in frontmatter

#### Scenario: Template unreadable
- **WHEN** the packaged `templates/proposal.md` cannot be read
- **THEN** the fallback proposal has the same six sections in the same order
