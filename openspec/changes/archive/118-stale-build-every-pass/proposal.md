---
title: A watcher or land running an old build stops and says to rebuild
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
---
## Goal

osq checks for a stale build only when the watcher starts. Three times now, a
watcher or `osq land` kept running a `dist/` older than main's source. On
2026-09-29, after `osq land 116`, the running watcher still ran a build from
before 116, and 115 looped on `spawn E2BIG` until the human rebuilt and
restarted it.

After this change, the watcher runs the stale check again before each spawn
and each archive. When it finds the build stale, it prints the stale line and
exits 1. `osq land` runs the same check before it lands. When a land changes
osq's own `src/`, it prints a line telling the human to rebuild and restart
the watcher.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests start a watcher
whose `src/` becomes newer during a run, and check that it finishes the
running task, archives nothing, and exits 1 with the stale line. Other new
tests land a change with a stale build, with `--allow-stale`, and into the
package's own repository, through `landCommand`.

## Non-goals

- Rebuilding automatically, or restarting the watcher itself.
- Changing what the banner or `build_stamp` report.
- Checking an installed osq package against its registry version.
- Moving `osq land` to `CommandError`. Change 111 left `land` out because it
  already sets the exit code without ending the process, so the stale refusal
  follows "Land command": message on stderr, exit one.

## Surface

- Added: `osq land --allow-stale` (flag)
- Added: `osq land` stdout line `osq's own source changed; run the build and restart the watcher`
- Changed: `osq watch` exits 1 with the stale line during a run, not only at start

## Decisions

- ADR 001: unchanged; `osq land` still loads `osq.config.ts` through `loadConfig`, after the stale check.
- ADR 002: unchanged; the check runs before archive starts, and archive itself still merges deltas without a model.
- ADR 004: unchanged; no validator call moves.
- ADR 005: unchanged; no validator call moves.

## Background

**The check today.** `checkStaleBuild` in `src/watcher/build.ts` compares the
newest file mtime under the osq package root's `src/` with the newest under
its `dist/`. When `src/` is newer, it prints `osq build is stale: src/ is
newer than dist/. Run 'npm run build' or pass --allow-stale.` and calls
`process.exit(1)`. It skips a package without `src/` (an installed one) and a
run from TypeScript source. `startWatcher` in `src/watcher/loop.ts` calls it
once, unless `allowStale` or `dev` is set.

**Compare against the loaded build.** A watcher keeps running the code it
loaded at start. If the human rebuilds without restarting it, `dist/` on disk
is fresh, but the running code is still old. So the watcher reads the newest
`dist/` mtime once at start and compares each later pass against that. Each
pass then walks only `src/`. Measured on this repository on 2026-09-30: the
`src/` walk (304 files) takes about 25 ms and the `dist/` walk (1212 files)
about 90 ms. Either cost is small next to a task, so the reason to cache is
correctness, not speed.

**Where the watcher checks.** It checks at the top of the branch that picks
up a pending task, before the sync, the scope audit, and `runTask`, and at
the top of `archiveCompletedSpec`, before the worktree checks. Cycles run one
after another, so no task is running when a check fires. A task that just
finished has already written its done marker and worktree commit, and the
check before its archive stops the watcher before the archive starts. A stale
check throws a `StaleBuildError`. The per-change `catch` in `runWatcherCycle`
rethrows it instead of logging `watcher error`, and `startWatcher` stops the
loop, prints the line, and exits 1.

**How land knows what it changed.** `fastForward` in
`src/core/vcs/git-vcs-land.ts` already lists every path the land commit
changes, to find blocked ones. On `done` it now also returns that list as
`changed`. `landChange` turns those paths into absolute paths under the
repository root and returns them. `landCommand` prints the rebuild line when
one of them lies under `<osq package root>/src/`, with both roots resolved
through real paths so a linked global `osq` counts as the same package. In a
consumer project, osq's package root is outside the repository, or has no
`src/`, so nothing matches.

**Measured fallout.** One pinned line changes:
`tests/vcs-land-ops.test.ts` deep-equals a `done` result with
`{ status: 'done', blocked: [] }`. `changed` is present only on `done`, so
the two `blocked` assertions stay as they are. Every other caller of
`runWatcherCycle` passes four arguments. The new options argument is
optional, and a run from source skips the check, so those tests are
unaffected.

**Right now.** This checkout's `dist/` is older than `src/`. Run `pnpm build`
before starting the watcher for this change.

## Contract

### Requirement: Stale check before each spawn and archive
The watcher SHALL run the stale check before each spawn and each archive,
with the start check's skips and escapes. When stale, it SHALL start nothing
new, write no marker, print the stale line, and exit 1.

#### Scenario: Source edited during a run
- **WHEN** a watcher started fresh, and `src/` gets a newer file while task 1 of a one-task change runs
- **THEN** task 1 is done, the change is not archived, and the watcher prints the stale line and exits 1

### Requirement: Land checks the build
`osq land` SHALL refuse with the stale line when the build is stale, unless
`--allow-stale` is passed. After a land that changes osq's own `src/`, it
SHALL print `osq's own source changed; run the build and restart the watcher`.

#### Scenario: Stale land
- **WHEN** `osq land 001` runs with a stale build
- **THEN** it prints the stale line to stderr, exits one, and the default branch has not moved

#### Scenario: Land into osq itself
- **WHEN** the land commit adds `src/one.txt` and osq's package root is the repository root
- **THEN** stdout ends with `osq's own source changed; run the build and restart the watcher`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Stale build preflight detection".
- `specs/cli-foundation/spec.md`: adds "Land checks the osq build".
- `specs/version-control/spec.md`: modifies "Vcs land operations" and adds "Land reports changed paths".

Two tasks. No file is shared. Task 2 imports `findStaleBuild` and
`osqPackageRoot` from `src/watcher/build.ts`, which task 1 adds, so task 2
runs after task 1.
