---
title: One executor prompt
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Build the executor prompt in one place, and make every instruction file an
executor reads agree with it.

Today the agy, opencode, and codex adapters each assemble the prompt
themselves. The agy and opencode copies match each other; the codex copy alone
names the delta and living specs and tells the executor to run `verify` first.
All three restate the managed `AGENTS.md` procedure in their own seven rules, so
the executor reads the same protocol twice in different words. The result file
contents are a prose list, and 046's results show executors inventing their
own headings. Doctor never inspects `.opencode/agent/osq-coder.md`, the
executor agent file `osq setup` writes, so a consumer's copy can go stale
silently.

After this change, one `buildExecutorPrompt` produces the prompt for all three
harnesses. Its rules and exit text are the same exported constants in
`init-blocks.ts` that assemble the managed `AGENTS.md` block, and those
constants name the result headings exactly. Doctor fails when the opencode
executor agent file is missing or stale, and names `osq setup` as the fix.

## Verify

`pnpm verify`

The suite proves the managed constants and their copies in `AGENTS.md` and
`.opencode/agent/osq-coder.md`, byte-identical prompts across agy, codex, and
opencode against checked-in golden prompts, the prior-context and
capability-rule sections, and doctor's agent-file check, without a network
service, TTY, or real model.

## Non-goals

- Changing what the executor may do, or how the watcher verifies.
- Changing delivery: OpenCode keeps its `--file` attachments and flags, Codex
  its single literal prompt argument and flags, agy its argv.
- Parsing the result file or its `Touched:` line. Repo-wide scope detection will
  read it later.
- Changing `osq-planner.md`, the Claude or mock adapters, or `PLANNER.md`.
- Shortening the opencode agent file to a pointer. It keeps the full managed
  block, now covered by doctor.

## Contract

### Requirement: Shared executor prompt

Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte. The prompt SHALL name the task file, `proposal.md`, the task
title, scope, entry files, verification command, result destination, prior
context, delta spec paths, and living capability spec paths, then the managed
executor steps, capability rules, the managed exit text, and one line naming the
concrete result path. It SHALL NOT name `features/` or a parent `spec.md`.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability
- **THEN** every harness prompt lists both paths

### Requirement: Executor protocol constants and result headings

The managed `AGENTS.md` block SHALL be assembled from exported executor-step and
exit-text constants, and the exit text SHALL name the result headings
`## Changed`, `## Deviated`, `## Missing context`, and `## Next`, followed by a
final `Touched:` line.

#### Scenario: Prompt and block agree
- **WHEN** the managed block and a harness prompt are compared
- **THEN** both contain every executor step line and every exit line verbatim

### Requirement: Harness agent file diagnostics

When the execution or planner harness is `opencode`, doctor's `managed-blocks`
check SHALL compare `.opencode/agent/<opencode.agent>.md` with the managed
`AGENTS.md` block and SHALL name `osq setup` as the fix when it is missing or
stale.

#### Scenario: Stale agent file
- **WHEN** the harness is `opencode` and the agent file holds an older managed block
- **THEN** the `managed-blocks` check fails, naming the file and `osq setup`

#### Scenario: Other harness
- **WHEN** the harness is `codex` and no agent file exists
- **THEN** the agent file does not affect the `managed-blocks` check

## Human steps

- Before approving, run two or three real tasks on the current prompt and keep
  their result files and dead letters as a baseline.
- Review the proposal, both deltas, and the three task bodies, then run
  `pnpm osq approve 050` yourself.
- After the change lands, run `osq init` and `osq setup` in each consumer
  project. Until then `osq doctor` reports drift in `AGENTS.md` and, for opencode
  users, in the executor agent file. That is intended.
- Then run two or three real tasks again and compare results and dead letters
  with the baseline.

## Delta

- `specs/watcher-and-harness/spec.md` adds `Shared executor prompt` and moves
  the source comment of `Capability rule prompt injection` to the shared builder.
- `specs/cli-foundation/spec.md` adds `Executor protocol constants and result
  headings` and `Harness agent file diagnostics`.

Task 1 owns the managed constants and every copy of the managed block. Task 2
builds the prompt from those constants, so it runs after task 1. Task 3 is
independent. No file belongs to two tasks.

`osq lint` warns that task 2 touches `src/harness/` without a file under
`tests/fixtures/events/`. The warning doesn't apply here: the golden event
streams come from the mock harness and never contain prompt text, and task 1
already owns those fixtures.
