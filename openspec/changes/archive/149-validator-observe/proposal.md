---
title: A validator agent judges each change against its spec, observe only
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, traceability]
---
## Goal

Every gate osq runs is deterministic. The gates prove the executor's tests
pass, but not that those tests express the delta's scenarios. After a
change's verify and check pass at archive, a validator agent on a different
model reads the delta specs, the change's diff and its tests, and says which
scenarios no code meets, no test covers, or whose test would pass without the
change. osq records the findings in a `validator_ran` event and archives the
change exactly as before. `osq show` prints the findings and `osq report`
counts them. The validator only observes, so ADR 010 can record how its
false positives are measured before it blocks anything or is removed.

## Verify

`pnpm verify`

This runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check the `validator` config block and its errors, the doctor warning,
the scaffolded comment, and `patch` against a base in a temporary repository.
They also check the scenarios, diff and tests osq gives the validator, the
prompt order, and the strict findings parser. A run at archive is tested in a
linked osq worktree with a fake adapter: findings are recorded, a failing,
timed-out or unreadable validator still lets the change archive, and edits
the validator makes are put back. The `osq show` and `osq report` output is
checked from recorded events. Every existing test passes unchanged.

## Non-goals

- Blocking anything. A later change makes the validator a gate or removes it,
  as ADR 010 says.
- Fixing code, or reviewing style, naming or architecture. Checking code
  against ADR rules is a later step and is measured on its own. The findings
  format has a `kind` field so a second kind of finding fits later, but this
  change emits only `scenario` findings.
- Opting osq's own capabilities into traceability.
- A validator per task. It runs once per change.
- A `confinement.roles.validator` block. The validator runs with the agent
  role's allowlist built for its own harness (ADR 010).
- Running the validator harness's `setup` or `preflight`. A harness that
  cannot start is recorded as `failed`.
- Showing findings in the web dashboard.

## Surface

- Added: `validator` block in `osq.config.ts` with `enabled`, `harness`, `model` and `timeoutSeconds` (config keys).
- Added: `validator_ran` event in `.run/events/change.jsonl`, with outcomes `validated`, `failed`, `timed_out`, `unreadable` and `not_run` (reasons `no_base`, `no_scenarios`).
- Added: `.run/events/validator.jsonl`, the validator harness's own event stream.
- Added: `.run/validator/` holding `diff.patch`, `scenarios.md` and the validator's `findings.json`; osq removes it after each run.
- Added: `validator-model` check in `osq doctor`.
- Added: `Validation:` section in `osq show` and `osq report`, and the `validation` key in their JSON.
- Added: a commented-out `validator` block in the `osq.config.ts` that `osq init` writes.
- Added: `### Validator` section in README.
- Added: `decisions/010-validator-role.md` (ADR 010).
- Changed: osq's own `osq.config.ts` turns the validator on with `claude` and `claude-opus-5-5`.

## Decisions

- ADR 001: the `validator` block loads through the existing jiti config loader; no loader is added.
- ADR 002: the validator runs after the deltas are applied and never changes them or the living specs; the tree guard puts back any edit it makes.
- ADR 004: unrelated. The OpenSpec validator keeps the doctor check named `validator`, so the new check is named `validator-model`.
- ADR 005: unrelated, for the same reason; the peer range check does not change.
- ADR 008: `osq report` reads `validator_ran` from the event files through the shared reader; nothing lives only in the read index.
- ADR 010 (new, task 1) governs watcher-and-harness and cli-foundation: the validator judges a change once at archive on its own harness and model, writes only its findings file, and never stops or changes the change.

## Background

**Hand runs before fixing the format.** On 2026-10-04 the planner, on the
model osq's validator will use, ran the validator's job by hand over three
archived changes. It read each one's deltas first, then the diff from
`.run/base` to the change's commit with `openspec/` left out, then the tests,
then the executor results.

- **112 test-path-meanings** (5 deltas, a refactor). The test for
  spec-lint's "Named test outside tests" passes on the base: before the
  change, `isTestFilePath` in `linter.ts` already ignored `src/quote.test.ts`.
  This would be a `passes_without_change` finding, but the change is a
  refactor that pins existing behavior on purpose. So the rule says to report
  `passes_without_change` only for behavior the base did not have.
  traceability's "Test and source paths" also has no test in the diff, but a
  test from before the change covers it. A validator given only the diff
  would have reported a false `no_test`. So the validator reads the whole
  repository, and osq lists only the scenarios the change adds or changes.
- **143 stale-build-names-root** (1 delta). The two new scenarios, "Stale line
  names the package root" and "Error carries the found line", have code and a
  test that fails on the base, because `staleBuildMessage` does not exist
  there. No findings.
- **140 line-budget-full-paths** (1 delta). All four scenarios are covered by
  `tests/line-budget-check.test.ts`, which fails on the base because the
  module is missing. No findings.

From these runs: the findings file is JSON, `{"findings": []}` when nothing is
wrong, and each finding names one scenario, one of three problems, and one
sentence of detail. The executor results add nothing the code and tests do
not show. They come last in the prompt, as claims.

**Why the validator reads the tree, and what protects it.** It runs in the
change's worktree at archive, after the deltas are applied, so it can open
any file. Before spawning, osq records `vcs.status()` and the contents of
every file it lists. After the spawn, osq puts back every path the validator
changed, apart from its own `.run/validator/` and
`.run/events/validator.jsonl`. A file that was dirty before gets its recorded
contents back, and any other path goes through `vcs.discard`, which needs a
linked worktree on an `osq/` branch. `.run/base` only exists for changes
that run in such a worktree, so a change without it is `not_run` with reason
`no_base` and nothing spawns. Ignored files such as `dist/` and
`node_modules/` are not guarded. Harness permissions are the guardrail
there, as in ADR 007.

**Why `not_run`, not `skipped`.** spec-lint-and-approve's "Pinned OpenSpec
validator failure gating" forbids the word "skipped" anywhere in `src/`,
comments included, and `tests/no-skipped-in-src.test.ts` enforces it. A run
that never spawns is therefore `not_run`, its type is
`ValidatorNotRunReason`, `readValidatorInputs` returns `{ notRun: <reason> }`,
and `osq show` prints `Validation: not run (<reason>)`. The first attempt at
task 4 died `blocked` on this. ADR 010, which task 1 writes, and the README's
`### Validator` section, which task 2 writes, list the outcomes too, so task 4
also owns `decisions/010-validator-role.md` and `README.md` (shared files)
and changes that word in each.

**Reusing `spawn`.** Every adapter builds its argv around
`buildExecutorPrompt(options)`. An optional `prompt` on `SpawnTaskOptions`,
returned unchanged by `buildExecutorPrompt`, lets the validator use any
adapter's delivery, model flags and environment without a new adapter
method. The validator's model goes in through `validatorRunConfig`, which
sets `harness` and the harness section's `model` from the catalog's
`configKey`. Claude Code's `Write(./**)` rule keeps writes inside the
project root, which is why the findings file sits under the change's `.run/`
and not in a temp folder.

**The diff base.** `.run/base` holds the commit the change's branch started
from (`stack-cut.ts`, `stack-dependencies.ts`). `patch` already diffs every
change against HEAD through a temporary index. It gains an optional base
commit and keeps its behavior when none is given.

**`osq init`.** The scaffolded config gets the block commented out. An
enabled block would make every new project's archives spawn a second
provider it may not have a key for. A disabled block is noise. A comment
shows the shape and the advice to pick a different model.

**osq's own config.** osq turns the validator on with `claude` and
`claude-opus-5-5`, the model that plans osq's changes, judging the `pi`
executor's work. That is the measurement ADR 010 needs.

**The validator role (ADR 010).** Task 1 writes it, in the format of
`decisions/009-loopback-write-actions.md`, with
`applies_to: [watcher-and-harness, cli-foundation]`,
`checks: [tests/validator-config.test.ts]`, and this rule:

```
The validator judges a change once at archive on its own harness and model, writes only its findings file, and never stops or changes the change.
```

Its sections:

- **Context:** the deterministic gates and what they cannot see (the Goal
  above), ADR 006 decision 4, and the 2026-10-04 decisions: per change, a
  different model by default, a doctor warning when they match, no style or
  architecture.
- **Decision:**
  1. What osq gives the validator: the delta specs, the scenarios to judge,
     the diff against `.run/base` without `openspec/`, the tests that diff
     adds or changes, and read access to the repository. Last come the
     executor results, labeled as claims to check.
  2. What it may write: only `.run/validator/findings.json`. It never edits
     code, tests or specs and never runs git. osq puts back anything else it
     changes and records each path in `restored`.
  3. Its environment: the agent role's allowlist from ADR 007, built for the
     validator's harness, so it gets that harness's model key names and
     `confinement.roles.agent.env`. A role block of its own comes with a
     later confinement stage.
  4. Its model: its own `harness` and `model`, required while it is on, never
     the executor's or `OSQ_MODEL`. `osq doctor` warns when they match the
     executor's, because a validator on the builder's model shares its blind
     spots. It is a warning so a project with one provider key can still run
     it.
  5. It never blocks. Every outcome is recorded and the archive goes on.
- **Measurement:** due after 15 changes with outcome `validated` or on
  2026-11-15, whichever comes first. A human labels each finding true or
  false by reading the code, in the brief that follows. It becomes a gate if
  at least two thirds of the findings are true and at most one change in five
  has a false finding. It is dropped if fewer than one third are true, or if
  more than one run in five is `failed`, `timed_out` or `unreadable`.
  Anything in between gets one more window of the same size with a revised
  prompt, and then it must block or go.
- **Consequences:** archives wait up to `timeoutSeconds` (900 by default),
  each archive costs one validator run, and the `.run/events/validator.jsonl`
  tokens count in the report's totals.
- **Rejected:** a validator per task (it sees too little and costs one run
  per task); giving it only the diff (the 112 false `no_test`); putting the
  executor results first (the coder's story steers the reviewer); falling
  back to the executor's model (shared blind spots); a temp folder for the
  findings (Claude Code writes only inside the project root).

**Measured fallout.** A rough version of the edits to existing files ran in a
scratch worktree on 2026-10-04: the config block wired into `defineConfig`,
`OsqLimits` moved out of `config.ts`, the scaffolded comment, osq's own
`validator` block, `patch(base?)`, the `validator_ran` event type, and the
prompt override. Both typechecks, the build, and all 3,353 tests passed. The
only failure was import order, which biome fixes. No existing test pins the
scaffolded config or osq's own config beyond regexes the change keeps, so no
task sets `tests.modify`. `config.ts` is at 249 lines and goes over 250 with
the block, so task 1 moves `OsqLimits` into `config-limits.ts` (237 lines
after). `checkAndArchiveSpec` grows by two lines and stays under the
80-line function budget. `show-text.ts` (240) and `show-model.ts` (208) take
only a call each, with the new code in new modules.

## Contract

### Requirement: The validator observes, never decides

At archive, after the check, osq SHALL run the configured validator once and
record its findings, and the change SHALL archive whatever the validator does.

#### Scenario: A finding does not stop the archive
- **WHEN** a change's validator reports that no test covers one of its scenarios
- **THEN** the change archives, and `osq show` for it prints that scenario with `no test covers it`

#### Scenario: A broken validator does not stop the archive
- **WHEN** the validator's harness crashes, times out, or writes no readable findings
- **THEN** the change archives and its `validator_ran` event records `failed`, `timed_out` or `unreadable`

## Human steps

### Before approval

None

### After landing

- Rebuild osq and restart `osq watch` so archives run the validator; the watcher runs the code it loaded at start.
- osq's own validator uses the `claude` CLI on the watcher's host, logged in or with `ANTHROPIC_API_KEY` set. Without it each archive records `failed` and goes on.
- On 2026-11-15, or after 15 validated changes if sooner, read the findings with `osq report` and `osq show <id>`, label them, and write the block-or-drop brief ADR 010 asks for.

## Delta

- `specs/cli-foundation/spec.md`: adds "Validator configuration", "Validator model doctor check", "Validator scaffold", and "osq validates its own changes".
- `specs/watcher-and-harness/spec.md`: adds "Validator run at archive", "Validator inputs", "Validator prompt", "Validator findings file", and "Validator tree guard"; modifies "Shared executor prompt" to add the prompt override.
- `specs/version-control/spec.md`: modifies "Vcs write operations" so `patch` takes an optional base, adding "Patch against a base".
- `specs/status-inspection/spec.md`: adds "Validation in show".
- `specs/metrics-and-reporting/spec.md`: adds "Validation in report".

No file is shared between tasks. `src/harness/types.ts` and
`src/harness/prompt.ts` belong to task 4, which adds the event payload and
the prompt field that task 5 uses.
