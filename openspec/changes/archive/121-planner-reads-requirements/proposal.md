---
title: Planners and executors read the requirements they need, not whole capability specs
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
    - watcher-and-harness
---
## Goal

The living specs total about 600 KB. watcher-and-harness is 153 KB,
cli-foundation 130 KB, and spec-lint-and-approve 85 KB. The planner block tells
planners to read "the capability specs this change touches", the executor
protocol tells executors to read "the delta specs and capability specs it
names", and the plan prompt says "Read the ones this change writes or whose
code it uses." Read literally, a planner reads 200 KB or more for a change
touching two capabilities, and a task that names cli-foundation sends a cheap
executor through 130 KB.

After this change, `osq spec` lists the living capabilities, lists one
capability's requirement names, or prints one requirement with its scenarios.
The executor protocol, the planner block, and the plan prompt ask for the
requirements a change or task touches through that command, and the opencode
planner agent may run it.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests run `osq spec`
against a temporary project's living specs, check the new wording in every
managed block and its checked-in copies, and check that the opencode planner's
permissions allow `osq spec` and still deny chained commands.

## Non-goals

- Splitting or shortening the living specs.
- Changing what tasks or proposals must name.
- Changing the executor prompt's `Living Capability Specs:` list, which still
  names the capabilities a change reads or writes.
- Fuzzy or case-insensitive requirement matching.

## Surface

- Added: `osq spec [capability] [requirement]` (command)
- Changed: executor step 1 in the managed `AGENTS.md` block and executor prompts
- Changed: planner step 1 in the managed `PLANNER.md` block
- Changed: the plan prompt's `## Capability Specs` sentence
- Changed: the opencode planner agent file allows `osq spec*`, `pnpm osq spec*`, and `npx osq spec*`

## Decisions

- ADR 001: unchanged; `osq spec` loads `osq.config.ts` through `loadConfig` like every command.
- ADR 004: unchanged; `osq spec` reads living specs with osq's own parser and never runs the OpenSpec validator.
- ADR 005: unchanged; no validator version check is added or changed.

## Background

**Parser.** `parseCapabilitySpec` in `src/core/spec/delta.ts` splits a living
spec into requirements. Each `DeltaRequirement` carries `name`, already passed
through `normalizeRequirementName`, and `raw`, the block from its
`### Requirement:` line through its last scenario. `getSpecsDir` in
`src/core/status/layout.ts` resolves the specs directory from
`config.paths.openspecRoot`, as `capability-impact.ts` already does.

**Line budget.** `src/cli/index.ts` measures 250 lines by
`tests/line-budget.test.ts`'s count. Registering the command adds an import and
a call, so task 1 folds `raw` into the `map` call in both `-print` argv
rewrites at the end of `createProgram`. Tried in a scratch copy: the file
measures 250, biome passes, and the line and function budget tests pass.
`createProgram` is grandfathered by name in `tests/function-budget.test.ts` and
stays far over 80 lines, so that list doesn't change.

**Measured fallout.** In a scratch copy with the new wording in
`init-blocks.ts` and `plan-sections.ts`, the tests that read those constants,
the golden prompts, or the repository's managed copies were run.

- Pinned text: `tests/managed-wording.test.ts` holds the old plan prompt
  sentence, and `tests/fixtures/prompts/agy.txt`, `codex.txt`, and
  `opencode.txt` hold the old executor step 1. These change in tasks 3 and 2.
- Repository copies: `tests/managed-blocks.test.ts`, `tests/init-planner.test.ts`,
  and the doctor test "passes all checks on the osq repository itself" compare
  `AGENTS.md`, `PLANNER.md`, `templates/PLANNER.md`, and
  `.opencode/agent/osq-coder.md` with the constants. They pass once task 2
  updates the copies; the tests themselves don't change.
- `tests/opencode-planner-setup.test.ts` pins the planner agent file's exact
  bytes and its `bash` key list, so task 3 updates both constants in it.

`OPENCODE_AGENT_TEMPLATE` in `opencode.ts` embeds `MANAGED_AGENTS_BLOCK`, so
`.opencode/agent/osq-coder.md` follows task 2's constant change without an
edit to `opencode.ts` in that task.

**Lint warnings left on purpose.** `src/harness/opencode/opencode.ts` is owned
by watcher-and-harness, but the requirement it implements, "Opencode planner
agent configuration", has always lived in cli-foundation, so the delta goes
there. The warnings that each task's files are imported by preexisting tests
are covered by the measured fallout above: only the named tests change. Task
3's warning about `tests/fixtures/events/` doesn't apply, because no event
translation changes.

A template literal holds the plan prompt sentence and the managed blocks, so
every backtick in the new wording is escaped there.

## Contract

### Requirement: Spec command
`osq spec [capability] [requirement]` SHALL print living capability names,
requirement names, or one requirement.

#### Scenario: One requirement
- **WHEN** `osq spec alpha "First rule"` runs in a project whose `alpha` spec has that requirement
- **THEN** it prints that requirement's block from `### Requirement: First rule` through its last scenario, and exits 0

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Spec command", "Spec command documentation", "Executor requirement reading", and "Planner requirement reading"; modifies "Plan prompt spec list label" and "Opencode planner agent configuration".
- `specs/spec-lint-and-approve/spec.md`: adds "Living requirement lookup" and "Living requirement lookup errors".

Three tasks, in order. No file is shared between tasks.
