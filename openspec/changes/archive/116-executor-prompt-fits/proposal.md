---
title: Executor prompts carry only changed rules, and a spawn that throws kills the task
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - version-control
---
## Goal

115 never started its task. Its executor prompt carried 415 capability rules,
263 KB in one command-line argument, and Linux refused the spawn with
`E2BIG`. The error escaped the runner, so the watcher logged `watcher error`
every cycle, wrote no dead marker, and `osq reject` saw a healthy change.

After this change, the prompt leaves out a rule the change doesn't alter, and a
spawn that throws kills the task as `crashed` like any failed agent.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. Two new tests check that the
executor prompt drops unchanged rules, and that a throwing spawn ends in a
`crashed` dead marker.

## Non-goals

- Passing the prompt through stdin or a file. Once the rules are filtered, the
  rest of the prompt is paths and fixed text, a few KB. Each harness CLI takes
  its prompt differently, and nothing needs that yet.
- A size limit or truncation for the prompt.
- Changing `osq reject`. A dead task already makes a change rejectable, which
  the 115 recovery confirmed with a hand-written marker.
- Changing auto-retry. `crashed` is already retried automatically once.

## Surface

None

## Decisions

- ADR 002: unchanged; archive still merges this change's delta without a model.

## Background

**Where the size came from.** `buildExecutorPrompt` in
`src/harness/prompt.ts` lists files by path, then adds `Capability Rules:`
from `resolveCapabilityRules`. `extractCapabilityRules` in
`src/harness/types.ts` turns every requirement header in the change's deltas
into a rule. 115's deltas repeated 414 requirements word for word, minus a
source comment, plus 1 new one. Every adapter passes the prompt as one
argument, and Linux limits one argument to 128 KB.

**The filter.** A delta requirement whose statement equals the living
requirement's with the same name tells the executor nothing new. It uses the
same statement `extractCapabilityRules` already builds, with comments stripped
and whitespace collapsed. With the filter, 115's generated deltas give 0 rules
instead of 414. A requirement new to the capability, or reworded, keeps its
rule. So does every requirement of a capability with no living spec yet.
The living spec is read from the project root the prompt already has, under
`paths.features`, as `livingSpecPaths` in `src/harness/prompt.ts` does.

**The throw.** `spawnWithTimeout` in `src/harness/process.ts` calls Node's
`spawn` inside a promise, and `spawn` throws `E2BIG` synchronously, so the
adapter's `spawn` rejects. `spawnTaskAgent` in `src/watcher/spawn.ts` awaits
it without a catch. A new `spawnOrCrash` in `src/watcher/spawn-guard.ts`
turns the throw into a result with exit code -1 and the message, and the
existing `crashed` path writes the dead marker. It covers every adapter.
`spawn.ts` must stay under 200 lines (`tests/import-graph.test.ts`), and it
has 197, so the helper gets its own module and `spawnTaskAgent`, which is on
the function-budget grandfather list, doesn't grow.

**Measured fallout.** A rough version of both tasks ran in a scratch worktree
of main on 2026-09-29. The CLI typecheck, biome, and the full suite passed,
except the `bin-execution`, `package-*`, and `web-export` tests that need a
build the scratch copy didn't have. `tests/harness-prompt-injection.test.ts`
calls `extractCapabilityRules` with only the change folder and passes
unchanged. No existing test changes.

**After this lands.** The watcher runs the built osq, so run `pnpm build` on
main before approving the re-planned source comment sweep.

## Contract

### Requirement: Prompt carries changed rules
The executor prompt SHALL carry a capability rule only for a requirement the
change adds or rewords.

#### Scenario: Sweep with one new requirement
- **WHEN** a change's deltas repeat 400 living requirements unchanged and add 1
- **THEN** the executor prompt carries 1 capability rule

### Requirement: Throwing spawn
A harness spawn that throws SHALL kill the task as `crashed`.

#### Scenario: Spawn E2BIG
- **WHEN** the adapter's `spawn` throws `spawn E2BIG`
- **THEN** the task gets a `crashed` dead marker with that message, and no watcher error is logged for it

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Capability rule prompt injection" and adds "Throwing spawn kills the task".

Two tasks. No file is shared.
