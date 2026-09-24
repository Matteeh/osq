# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Planner finish and approval handoff
<!-- source: src/core/foundation/init-blocks.ts, PLANNER.md, templates/PLANNER.md, tests/managed-wording.test.ts -->
The managed planner block SHALL tell an interactive planner to read what it
needs and then write the change folder, stopping after the task list only when
the human asks to review it first and then saying the folder is not written
yet. It SHALL tell every planner to finish by telling the human, in chat, the
task titles, that the change folder is written and `osq lint` passes, and the
exact `osq approve <id>` to run, and SHALL say the human should not approve
before that message. It SHALL say `## Human steps` never includes
`osq approve`.

#### Scenario: Planner block states the handoff
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it contains no instruction to stop after the task list by default, contains the finishing message with the exact `osq approve <id>`, and says `## Human steps` never includes `osq approve`

### Requirement: Planner delta guidance
<!-- source: src/core/foundation/init-blocks.ts, PLANNER.md, templates/PLANNER.md, tests/managed-wording.test.ts -->
The managed planner block SHALL say that guidance a task needs about another
capability's code, such as how to test against it, goes into that capability's
spec through a delta, not only into the task. It SHALL say that replacing a
requirement's behavior is a REMOVED requirement plus an ADDED one, because a
MODIFIED requirement must keep every scenario it already has and `osq lint` and
archive refuse one that drops any.

#### Scenario: Planner block states delta guidance
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names the other-capability delta rule and the REMOVED plus ADDED rule with its reason

### Requirement: Executor start and ownership wording
<!-- source: src/core/foundation/init-blocks.ts, AGENTS.md, .opencode/agent/osq-coder.md, tests/fixtures/prompts/**, tests/managed-wording.test.ts -->
Executor step 3 SHALL say that a `verify` naming a file the task creates fails
until that file exists, so starting red is expected. The managed `AGENTS.md`
line about `tasks.md` and `.run/` SHALL be addressed to executors and SHALL say
planners write `tasks.md` and the task files.

#### Scenario: Executor block states the start and ownership rules
- **WHEN** `MANAGED_AGENTS_MD_BODY` or an executor prompt is inspected
- **THEN** step 3 explains the expected red start and the ownership line names executors as the ones who never edit those files and planners as the writers of the task files

#### Scenario: Old blocks refreshed
- **WHEN** `osq init` runs on a project whose `AGENTS.md` and `PLANNER.md` hold the previous managed blocks
- **THEN** both blocks are replaced with the current ones and `osq doctor` reports no managed-block drift

### Requirement: Plan prompt spec list label
<!-- source: src/cli/plan-queue.ts, tests/managed-wording.test.ts -->
The plan prompt's `## Capability Specs` section SHALL start with the sentence
`All living specs. Read the ones this change writes or whose code it uses.` and
SHALL still list every living spec.

#### Scenario: Labeled spec list
- **WHEN** a plan prompt is built for a project with living specs
- **THEN** its `## Capability Specs` section starts with that sentence and lists every `openspec/specs/<capability>/spec.md`

## MODIFIED Requirements

### Requirement: Proposal seed template
<!-- source: templates/proposal.md, templates/openspec/schemas/osq/**, openspec/schemas/osq/**, src/core/foundation/new.ts, tests/new.test.ts, tests/proposal-seed-human-steps.test.ts -->
`osq new` SHALL seed `proposal.md` with the planning sentinel `verify` in
frontmatter and the body sections `## Goal`, `## Verify`, `## Non-goals`,
`## Contract`, `## Human steps`, and `## Delta`, in that order. The contract
placeholder SHALL be a `### Requirement:` block with a `#### Scenario:`, not a
table. The seeded `## Human steps` SHALL read `None`, and the osq schema's
instruction SHALL say the section never includes `osq approve`. The seed SHALL
NOT mention retired `features.writes`. The built-in fallback used when the
template file is unreadable SHALL carry the same sections.

#### Scenario: New change proposal
- **WHEN** `osq new <name>` creates a change
- **THEN** its `proposal.md` has the six sections in order, a requirement-and-scenario contract placeholder, `## Human steps` reading `None`, and `verify: node -e "process.exit(0)"` in frontmatter

#### Scenario: Template unreadable
- **WHEN** the packaged `templates/proposal.md` cannot be read
- **THEN** the fallback proposal has the same six sections in the same order
