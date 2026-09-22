---
title: Managed instructions split
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
---
## Goal

Make each managed instruction block serve one reader. The managed `AGENTS.md`
block becomes the executor's protocol, including the two gates that currently
kill tasks without warning: the change-level `verify` after every task and the
`tests.modify`-plus-`scope` rule for preexisting tests. The managed
`PLANNER.md` block becomes the planner's protocol, with interactive planning and
the `osq plan` handoff stated separately and the rules the watcher enforces
between tasks written down. The proposal that `osq new` seeds follows the
planner's parent-spec rules.

## Verify

`pnpm verify`

The complete suite proves the managed constants, their byte-equal copies in
`AGENTS.md`, `PLANNER.md`, and `templates/PLANNER.md`, init refresh and
foreign-block preservation, doctor's managed-block check, and the seeded
proposal without a network service, TTY, or real model.

## Non-goals

- Changing `.claude/commands/osq-plan.md` or `MANAGED_CLAUDE_PLAN_COMMAND`.
- Changing doctor, init, setup, or lint behaviour.
- Changing the seeded `tasks.md` or `tasks/1.md`, or the OpenSpec schema
  templates under `templates/openspec/`.
- Generating a `CLAUDE.md` in consumer projects.
- Changing the hand-owned parts of `AGENTS.md` or `PLANNER.md` outside the osq
  markers.

## Contract

### Requirement: Executor protocol in the managed AGENTS block

The managed `AGENTS.md` block SHALL be written for the executor. Its
`## Executing a task` section SHALL state the read order, the too-big exit,
reading a prior result, tests before code, the write boundary with the task's
`scope` authoritative over any injected ownership rule, that a preexisting test
may change only with `tests.modify: true` and the file inside `scope`, and that
the executor runs the task's `verify` and then the proposal's `verify` before
exiting. Its only planner content SHALL be a `## Planning a change` pointer.

#### Scenario: Executor reads the gates that can kill its task
- **WHEN** `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** it contains `## Executing a task`, `tests.modify: true`, the proposal's `verify`, and the sentence that the task's `scope` wins over any other ownership rule

#### Scenario: Planner arrives at AGENTS.md
- **WHEN** a planner reads the managed `AGENTS.md` block
- **THEN** its `## Planning a change` section sends it to `PLANNER.md` and names `plan-prompt.md` as the complete prompt only when `osq plan` started the session

### Requirement: Planner protocol in the managed PLANNER block

The managed `PLANNER.md` block SHALL state interactive planning and the
`osq plan` handoff as separate modes that share the write-boundary, lint, and
no-approval rules. Its task rules SHALL state that the watcher runs the
change-level `verify` after every task, that a later task changing an earlier
done task's resolved `scope` halts the change until a human runs `osq retry`,
that globs resolve again at every audit, and that `osq lint` enforces the
configured limits.

#### Scenario: Coupled tasks
- **WHEN** a planner reads the task rules
- **THEN** they say that tasks which pass only together are one task

#### Scenario: Shared file across tasks
- **WHEN** a planner reads the task rules
- **THEN** they say a later change to an earlier task's scope halts the change, and that the expected `osq retry` belongs under `## Human steps`

### Requirement: Proposal seed template

`osq new` SHALL seed `proposal.md` with sections in the order the planner
writes them, a requirement-and-scenario contract placeholder instead of a
table, and no mention of retired `features.writes`.

#### Scenario: New change
- **WHEN** `osq new <name>` creates a change
- **THEN** its `proposal.md` has `## Goal`, `## Verify`, `## Non-goals`, `## Contract`, `## Human steps`, and `## Delta` in that order, with the planning sentinel `verify` in frontmatter

## Human steps

- Review the proposal, the `cli-foundation` delta, and both task bodies, then
  run `pnpm osq approve 048` yourself.
- The watcher halts once for scope recertification, as expected: task 2
  regenerates `tests/fixtures/events/*.jsonl`, which task 1 also regenerated.
  When task 2 completes, run `pnpm osq retry 048 1`.
- After upgrading osq in a consumer project, run `osq init` there. Until then,
  `osq doctor` reports managed-block drift, which is intended.
- Still pending from 047: the scripted rewrite of old flat paths in
  `openspec/specs/*/spec.md` source comments.

## Delta

`specs/cli-foundation/spec.md` modifies three requirements and adds one:

- `OpenSpec agent documentation and managed instructions block` gains the
  executor protocol content.
- `Planner protocol rules in documentation and templates` gains the two planning
  modes and the between-task watcher rules.
- `Managed tool-native planning entry points` sends the AGENTS planning section
  to `PLANNER.md` and makes `plan-prompt.md` conditional on `osq plan`.
- `Proposal seed template` is added.

The modified requirements' source comments also move from the pre-047
`src/core/init.ts` to `src/core/foundation/init-blocks.ts`.

Task 1 owns both managed constants and their copies; task 2 owns the proposal
seed. Both regenerate `tests/fixtures/events/verified.jsonl` and `dead.jsonl`:
the golden test seeds a project with `osq init` and `osq new`, and its
`measures` events count those files' lines and the proposal's words. Task 2 runs
after task 1 and extends those fixtures. No other file is shared.
