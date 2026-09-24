---
title: Wording the ts-paas run found
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - status-inspection
---
## Goal

The instructions that planners, executors, and the human read say plainly what
the ts-paas run showed they need to know. Three confusions came up again and
again: what "starts red" means, when to approve, and which specs to read. After
this change none of them depends on reading between the lines. Planners no
longer stop after the task list by default; they write the change folder and
finish by telling the human the exact `osq approve <id>` to run. Everything here
is text. No rule, gate, or event changes.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass, including `osq doctor` on
osq's own repository. New tests prove that the managed blocks carry each new
rule and `osq init` refreshes old blocks; that the plan prompt's spec list
starts with the new sentence and still lists every living spec; that a seeded
proposal's `## Human steps` reads `None`; and that the watch log and `osq show`
state a task's pre-spawn start in words for the missing-file, verify-fails,
green, and mismatch cases.

## Non-goals

- New lint rules or gates, including a lint check on `## Human steps`.
- Changing pre-spawn event data, dead markers, or what `verify_starts` means.
- Changing which specs the plan prompt lists.
- Teaching the watcher to skip a `## Human steps` section that reads `None`.

## Surface

- Changed: managed `AGENTS.md` and `PLANNER.md` text; after upgrading, a project's `osq doctor` reports drift until `osq init` refreshes the blocks (managed document sections)
- Changed: the watch log prints one pre-spawn start line per task instead of only a mismatch warning (log text)
- Changed: `osq show`'s `Pre-spawn verify:` line states the start in words (show text)
- Changed: the plan prompt's `## Capability Specs` list starts with a sentence saying which specs to read (prompt text)
- Changed: the seeded proposal's `## Human steps` reads `None`, and the osq schema's instruction says it never includes `osq approve` (document section)

## Background

osq writes the managed blocks of `AGENTS.md` and `PLANNER.md` from
`src/core/foundation/init-blocks.ts`. `osq init` refreshes them and
`src/core/foundation/doctor-managed.ts` reports drift. `EXECUTOR_STEPS` also
feeds every executor prompt through `src/harness/prompt.ts`, so the golden
prompts in `tests/fixtures/prompts/` carry step 3 verbatim. The repository's
`AGENTS.md`, `.opencode/agent/osq-coder.md`, `PLANNER.md`, and
`templates/PLANNER.md` hold copies that tests require to equal the constants.

Every seeded proposal ends with a `## Human steps` line telling the human to run
`osq approve <id>`: `osq new`'s fallback in `src/core/foundation/new.ts`,
`templates/proposal.md`, and the osq OpenSpec schema in
`templates/openspec/schemas/osq/`, whose instruction says Human steps include
running `osq approve <id>`. The watcher prints `## Human steps` after archiving,
so every change so far ends by telling the human to approve it. osq's own
`openspec/schemas/osq/` must stay byte-identical to the template copy
(`tests/proposal-format.test.ts`). The seed's word count lands in the golden
`measures` events under `tests/fixtures/events/`.

The watch log prints nothing about a pre-spawn result except a mismatch warning
from `formatPreSpawnWarning` in `src/watcher/task-verify.ts`, and `osq show`
prints `Pre-spawn verify: exit <n>, expected <state>, <outcome>` from
`formatPreSpawnVerify` in `src/core/status/show.ts`. A start counts as red when
verify fails or when a path its verify names is missing, which is how
`isPreSpawnMismatch` already decides. `task-verify.ts` is 168 lines and
`show.ts` is on the line-budget allow list, so the shared wording lives in a new
module under `src/core/status/`, which the watcher may import.

A MODIFIED requirement must keep every scenario it already has: `mergeDelta` in
`src/core/spec/delta.ts` refuses one that drops any, both in `osq lint`'s trial
merge and at archive, as OpenSpec's own archive does. `openspec validate` alone
does not catch it.

Measured in a scratch worktree with a rough version of all three tasks: the
tests that pin changed text are `tests/harness-prompt-injection.test.ts` and
`tests/managed-blocks.test.ts` through their fixtures and repository copies,
`tests/doctor.test.ts` on osq itself, `tests/golden-events.test.ts` through
`tests/fixtures/events/`, `tests/proposal-format.test.ts`,
`tests/pre-spawn-verify.test.ts`, `tests/show-pre-spawn.test.ts`, and
`tests/show-pre-spawn-missing.test.ts`. No typecheck fallout.

## Contract

### Requirement: Planner finish
A planner SHALL write the change folder without stopping after the task list,
unless the human asks to review the list first, and SHALL finish by telling the
human the task titles, that the folder is written and lint passes, and the exact
`osq approve <id>`.

#### Scenario: Interactive planning
- **WHEN** a planner plans a change with a human in the session who did not ask to review the list
- **THEN** it writes the folder, runs lint, and ends with the approve command in chat

### Requirement: Pre-spawn start in words
The watch log and `osq show` SHALL state each pre-spawn start as `started red:
<paths> missing`, `started red: verify fails`, or `started green, as declared`,
adding `, but it declared <state>` on a mismatch.

#### Scenario: Missing test file
- **WHEN** task 2 declares `red` and its verify names a test file that does not exist yet
- **THEN** the watch log prints `task 2 started red: <path> missing`

## Human steps

None

## Delta

- `specs/cli-foundation/spec.md`: modifies "Proposal seed template"; adds
  "Planner finish and approval handoff", "Planner delta guidance", "Executor
  start and ownership wording", and "Plan prompt spec list label".
- `specs/watcher-and-harness/spec.md`: modifies "Pre-spawn verify event and
  mismatch handling".
- `specs/status-inspection/spec.md`: modifies "Detailed specification
  inspection".

Three tasks; no file is shared.
