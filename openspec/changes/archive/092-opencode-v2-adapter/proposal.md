---
title: Check the opencode adapter against opencode v2
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

The opencode adapter works with opencode v2 and says clearly when it cannot.
Tasks run with v2's `run` flags, the interactive planner starts through
`opencode mini`, and a run's token and cost totals include the final step that
v2's stream leaves out. Doctor adds a `harness-version` check for opencode
that passes inside `>=2.0.0 <3.0.0`, warns above it, and fails for opencode 1,
whose flags the adapter no longer passes; the watcher's preflight refuses
opencode 1 the same way.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests replay the
observed v2 stream and session export through the adapter with a fake binary,
check the v2 argument lists for tasks and planning sessions, and check the
version assessment and doctor lines for v1, v2, v3, and unparseable output.

## Non-goals

- Supporting opencode 1 alongside 2.
- Porting the planning usage readers. `opencode-usage.ts` and
  `opencode-observe-usage.ts` call `opencode db`, which v2 removed; they
  already degrade to no match, so approval prints "No planning record found"
  for opencode planning sessions.
- Changing this repository's default harness back.

## Surface

- Added: the `harness-version` line of `osq doctor` for the opencode harness (command output)
- Changed: `opencode.variant` is passed as `--model <model>#<variant>` instead of `--variant` (config key behaviour)
- Changed: opencode task runs pass `--standalone` and no `--dir`, and planning sessions run `opencode mini --prompt` (harness invocation)
- Changed: the watcher's preflight exits 1 for opencode 1 (command behaviour)

## Decisions

- ADR 001: no config loading changes.
- ADR 002: archive is unchanged.
- ADR 004: no validator call changes.
- ADR 005: no version check moves; the new range is opencode's, not OpenSpec's.

## Background

Observed on 2026-09-26 with `opencode v2.0.18`, which prints its version as
`opencode v2.0.18`.

- `opencode run` rejects the adapter's `--dir` and `--variant` with
  `Unrecognized flag: --dir in command opencode run`, so every task run fails
  today. The working directory is the process's `cwd`, which the adapter's
  `spawn` already sets to the project root. A variant goes into the model as
  `provider/model#variant`. `--agent`, `--auto`, `--format json`, `--model`,
  and `--file` remain. `--standalone` runs a private server instead of
  starting the background service.
- `opencode run --standalone --auto --format json --agent osq-probe` found an
  agent file in `.opencode/agent/osq-probe.md` with `mode: all` and a
  `permission` map, so the adapter's agent setup works unchanged.
- The top-level `opencode [directory]` takes `--prompt` but no `--model` or
  `--agent`; `opencode mini` takes `--prompt`, `--model`, and `--agent`.
  The adapter's interactive session passes the prompt as the first positional,
  which v2 reads as a directory.
- The JSON stream keeps v1's event shapes: `step_start`, `tool_use` with
  `part.tool` and `part.state.input`, `step_finish` with `part.tokens` and
  `part.cost`, and `text` with `part.text`. The existing parser handles them.
  v2 emits no `step_finish` for the final step, in two runs of two, so that
  step's tokens and cost never reach the events.
- `opencode session export --standalone <sessionID>` prints JSON whose
  `info.tokens` and `info.cost` hold the whole session's totals, including
  opencode's own title generation. Every stream event carries `sessionID`.
- `observed/run-stream.jsonl` is one real run that read a file and answered,
  and `observed/session-export.json` is that session's export, trimmed to
  `info`. Tests copy them as fixtures.

A trial on `5a2bee7` with the new argument lists broke
`tests/opencode-spawn.test.ts` and `tests/harness-interactive.test.ts`.
The preflight refusal also breaks the first case of
`tests/watcher-preflight.test.ts`, whose fake opencode prints `opencode 1.0.0`;
bumping it to `2.0.0` was checked against the full suite.
`buildOpencodeArgs` is grandfathered at 120 lines in the function budget and
stays above 80. `opencode.ts` is on the line budget's allow list.

## Contract

### Requirement: Agent files unchanged
Setup SHALL keep writing `.opencode/agent/<name>.md` exactly as before.

#### Scenario: Existing setup tests
- **WHEN** the existing opencode setup and planner agent tests run
- **THEN** they pass unchanged

## Human steps

### Before approval

- Task 2 died blocked on `tests/watcher-preflight.test.ts`, which its scope now
  includes. After approving again, run `osq retry 092 2`.

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "OpenCode diagnostics".
- `specs/watcher-and-harness/spec.md`: modifies "Interactive harness adapter spawning", and adds "OpenCode v2 task execution".

Two tasks, and no file is shared. Task 2's preflight uses task 1's version
assessment.
