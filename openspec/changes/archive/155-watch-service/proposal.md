---
title: osq watch runs in the background and picks up a new build by itself
depends_on: []
verify: pnpm verify
features:
  reads: [metrics-and-reporting, spec-lint-and-approve, version-control]
---
## Goal

`osq watch --background` starts the watcher for a project as a background
service and returns; `osq watch --stop` stops it. The service is osq's own
detached supervisor process. It runs the watcher as a child, restarts it
after a crash with a backoff from config, and restarts it when the osq build
on disk changes. That happens only between passes, never while a task runs.
When `dist/` is older than `src/`, the service waits for a build and says so,
where today the watcher exits and waits for a human to rebuild and restart
it. `osq` and `osq status` say whether a watcher runs, where, and which
build, and `osq status` prints the service log's path. This is M3 item 1. It
ends the stale-build class of incidents (after 110–112, 112's land, 116 and
149) without the service ever building osq.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests check the `watch` config block and the watch state files on a
temporary home; the service build check against a temporary package root
with `src/` and `dist/` mtimes set by the test, through `startWatcher` and
the mock adapter; the supervisor's restart, backoff, stop and log rotation
with an injected spawn and clock; `osq watch --background` and `--stop` end
to end, as real processes on a temporary project and home; the watcher line
in `osq` and `osq status`; and ADR 012.

## Non-goals

- One supervisor for several projects. The state folder is per project
  under `~/.osq/watch/`, so a later supervisor can list them.
- Starting at login. No systemd, launchd or other system unit is written; it
  does not come for free on WSL2, where `systemd --user` may be missing.
- Remote access, authentication or containers (M3 items 2 and 3).
- Building osq. The service never runs `pnpm build` and never runs git.
- Changing the foreground `osq watch`'s stale-build exit, `--dev`, or
  `--once`.
- A watcher line in `osq --json`, the dashboard, or `osq inbox`.

## Surface

- Added: `osq watch --background` (flag)
- Added: `osq watch --stop` (flag)
- Added: `watch` config block with `restartDelaySeconds`, `restartMaxDelaySeconds`, `buildSettleSeconds`, `stopWaitSeconds` and `logMaxBytes` (config keys)
- Added: `WatchConfig` type exported from `src/index.ts`
- Added: `Watcher:` line at the end of `osq`'s text output and of `osq status`
- Added: `Log:` line at the end of `osq status`
- Added: `OSQ_WATCH_ROLE` environment variable (`supervisor`, `worker`), set by osq for its own processes
- Added: `~/.osq/watch/<hash>/` with `service.json`, `watcher.json`, `watch.log` and `watch.log.1`
- Added: exit code 75 from a service worker that found a new build
- Added: `decisions/012-watch-service.md`

## Decisions

- ADR 001: the worker loads `osq.config.ts` through the same jiti loader as every other command; the `watch` block adds no loader.
- ADR 002: the service applies no delta; the worker archives exactly as the foreground watcher does.
- ADR 004: unchanged; no validator call is added or moved.
- ADR 005: unchanged; no validator call is added or moved.
- ADR 010: the validator still runs once at archive inside the worker, on its own harness and model.

## Contract

### Requirement: Background watcher

The system SHALL run the watcher as a background service that outlives the
terminal that started it, restarts it after a crash and on a new osq build
between passes, and waits instead of exiting when `dist/` is older than
`src/`.

#### Scenario: New build while idle
- **WHEN** the service runs and `pnpm build` writes a new `dist/` in osq's checkout
- **THEN** once the newest `dist/` file is `watch.buildSettleSeconds` old, the worker exits with 75, the supervisor starts a new one, and `osq status` shows the new commit

#### Scenario: Landed but not built
- **WHEN** `osq land` updates osq's `src/` and nobody has built yet
- **THEN** the service starts no task, `osq` shows `waiting: osq build is stale: ...`, and the next build restarts the watcher

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, stop the foreground `osq watch`, and start the service with `osq watch --background`. Builds after that are picked up by the service itself.

## Delta

- `specs/cli-foundation/spec.md`: adds "Watch service configuration" and "Background watch commands".
- `specs/watcher-and-harness/spec.md`: adds "Watch state files", "Service worker build checks" and "Watch service supervisor"; modifies "Stale build preflight detection" with one sentence pointing a service worker at the new requirement. Every existing scenario is kept.
- `specs/status-inspection/spec.md`: adds "Watcher line"; modifies "Concise inbox text" so it describes `formatInboxText`, with both scenarios kept by name.

Six tasks, in order. Task 1 adds the config block and the state files. Task
2 adds the worker's build check to the watcher loop. Task 3 adds the
supervisor. Task 4 wires `osq watch --background` and `--stop` and documents
them. Task 5 prints the watcher line. Task 6 records ADR 012, whose check is
task 3's test. No file is shared between tasks.

## Background

**How the service runs.** osq's own detached supervisor, not a generated
`systemd --user` or launchd unit. It needs no new dependency, works under
WSL2 without systemd, behaves the same on Linux and macOS, and keeps every
record in files osq already knows how to read. A unit could start at login,
but only on systems that have one, and osq would then own two ways to run the
same watcher. Starting at login is left out.

**Three processes.** `osq watch --background` spawns the supervisor detached
and returns. The supervisor spawns the worker, an ordinary continuous watcher
with a build check, and restarts it. The supervisor is started from the `osq`
entry path, so a worker it spawns after a rebuild loads the new `dist/`; the
supervisor's own code changes only when the service is stopped and started.

**Why the worker decides, and only between passes.** Only the watcher knows
where a pass begins. The build check runs at the top of each cycle and at
the two points where the stale check runs today, before a task is picked up
and before archive, so a running task and its outcome are always finished
first. That is the same place the stale check already stops the foreground
watcher, so the worker's exit leaves the same state a stale stop does.

**The build key.** `version` from osq's `package.json` and the newest mtime
under its `dist/`. A checkout's rebuild changes the mtime; an upgraded
installed package changes the version, because npm writes every packed file
with one fixed mtime. `buildSettleSeconds` keeps the worker from restarting
on a `dist/` that `tsc` is still writing; a worker that loaded a half-written
build and crashed is restarted by the crash backoff anyway.

**Where the records live.** `~/.osq/watch/<sha256 of the project's real
path>/`, like the inbox cursor and wait log, so nothing is written in the
project tree or a change folder, and a future multi-project supervisor can
list every service in one folder. A record counts only while its pid is
alive, so a killed process leaves nothing to clean up by hand.

**One watcher per project.** Every `osq watch` refuses to start while
another live watcher record exists for the project, so a terminal watcher
and the service never run tasks side by side.

**Measured on 2026-10-06** in a scratch worktree at f532410 with a rough cut
(the `watch` config block, `--background` and `--stop` on `watch`, a fixed
`Watcher:` line after `osq`'s text and `osq status`, ADR 012 and its index
line, and the README lines): the CLI typecheck and the build passed, and
3418 of 3420 tests passed, against 3419 of 3419 on a clean tree. The two
failures are both in `tests/inbox.test.ts`, the two cases that pin the bare
`osq` text; task 5 owns that file with `tests.modify: true`. No status,
config, help, README or decisions test pinned anything the change touches.
The background, supervisor and build-check paths are new code behind new
flags and a new `startWatcher` option, so they cannot move an existing test;
`tests/vcs-worktree-recreate.test.ts` and `tests/command-inputs-logger.test.ts`
call `watchCommand` with `once: true`, which reads records and writes none.
