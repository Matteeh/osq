---
title: osq formats a task's files before verify
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve, status-inspection, traceability, version-control]
---
## Goal

When `gates.formatCommand` is set, the watcher runs it on the files a task
changed in its scope after the agent exits and before the task's verify, so
a formatting-only diff can never kill a task. Formatting has one correct
result, so under ADR 006 it is osq's step, not the agent's. 155 task 2's
second attempt passed all 3,441 tests and died only on `biome check` line
wrapping in two files; with two different death reasons the change halted
until a human ran `osq retry 155 2`.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check `gates.formatCommand`, the `osq init` comment, osq's own config,
and the README bullet; and the format step through `runTask` on a temporary
project with a result-writing adapter that changes, creates and deletes
scoped files, a `.cjs` format command that rewrites the files it is given,
and a verify that passes only on formatted content.

## Non-goals

- Fixing lint findings other than formatting. osq's own command turns
  biome's linter off and keeps its formatter and import sorting.
- Formatting files outside the task's scope, including new test files an
  agent may add outside it, or files the task did not change.
- Formatting at archive, at land, or after a human edit.
- A dead reason for a failing format command; verify still decides.
- Showing format runs in `osq show`, `osq report`, or the dashboard.

## Surface

- Added: `gates.formatCommand` (config key), a command containing `{files}`
- Added: `format_ran` (event type) in task streams, with `command`, `files`, `exitCode`, `duration`, `timedOut` and `output`
- Added: three comment lines in the `osq.config.ts` that `osq init` writes
- Added: README "Gates and permissions" bullet "Formatting"
- Changed: osq's own `osq.config.ts` sets `gates.formatCommand`

## Decisions

- ADR 001: the new key is read by the existing jiti-loaded config; no loader is added.
- ADR 002: archive and delta application are untouched.
- ADR 004: no validator call is added or moved.
- ADR 005: no validator call is added or moved.
- ADR 010: the validator is untouched and judges the formatted tree at archive like any other.
- ADR 012: the watch service is untouched; formatting runs inside a task, so the supervisor never restarts the worker during it.

## Contract

### Requirement: Format before verify

When `gates.formatCommand` is set, the watcher SHALL run it once on the
task's changed scoped files after the agent exits and before the focused run
and the task's verify, record a `format_ran` event, and let verify decide
even when the command fails.

#### Scenario: Changed scoped files are formatted
- **WHEN** a task's scope is `src/a.ts`, `src/b.ts` and `src/c.ts`, the agent changes `src/a.ts`, creates `src/b.ts`, and leaves `src/c.ts`, and `gates.formatCommand` is `node fmt.cjs {files}`
- **THEN** the command runs as `node fmt.cjs 'src/a.ts' 'src/b.ts'`, one `format_ran` event records `files: ["src/a.ts", "src/b.ts"]` and `exitCode: 0`, `src/c.ts` is unchanged, and the task's verify sees the formatted content

#### Scenario: Nothing to format
- **WHEN** `gates.formatCommand` is unset, or the agent changed no scoped file
- **THEN** no format command runs and the task's stream holds no `format_ran` event

## Human steps

### Before approval

- `osq.config.ts` has uncommitted edits in your checkout (harness, opencode model, and the validator block removed). Task 1 edits the committed version of that file, so commit or discard your edits before `osq land 158`, or the land will stop on that file. Removing the validator block also fails `tests/validator-doctor.test.ts` ("osq's own validator") in your checkout.

### After landing

- Run `pnpm build` so the watcher formats tasks; until then it runs the old build.

## Delta

- `specs/cli-foundation/spec.md`: adds "Format command configuration".
- `specs/watcher-and-harness/spec.md`: adds "Format before verify".

No existing requirement is modified. "Role environments" already says every
`runVerificationCommand` caller other than prepare uses the verify role; the
format command is one more.

Two tasks, in order. Task 1 adds the config key, the `osq init` comment,
README's bullet, and osq's own setting. Task 2 adds the format step and the
event; it reads task 1's key. No file is shared between them.

## Background

**Which files.** The task's changed files come from osq's own record, not
the agent's `Touched:` line and not git, so the step works with `vcs`
enabled or not. The measures object already snapshots every resolved scope
path's content hash before the agent spawns; the format step compares the
scope now against that snapshot. Only scoped files can change, so the
format never trips the git guard's `scope_violation`, which runs before it,
or the scope audit of done tasks: a file a later task formats is one it was
allowed to change, exactly as if the agent had written it.

**Where it runs.** Inside `checkBlockedFirst`, after the blocked,
denied-dependency and missing-path checks and before the focused run. The
runner hands the measures object to it on the existing call line, because
`tests/import-graph.test.ts` keeps `runner.ts` under 200 lines and it has
199.

**Scope hashes.** The format runs before verify, so the done marker,
written after verify, records the formatted content. A file formatted in
one task and later audited before another task matches its recorded hash.
