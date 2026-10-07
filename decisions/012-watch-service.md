---
status: accepted
applies_to: [watcher-and-harness, cli-foundation]
rule: The watcher runs in the background under osq's own detached supervisor, which restarts it after a crash or a new build and never while a task runs.
checks:
  - tests/watch-supervisor.test.ts
  - tests/watch-service-build.test.ts
---
# 012. Watch service

Date: 2026-10-07

## Status

Accepted

## Context

The foreground watcher stops when it finds a stale build, and it needs a human
to build osq and start it again. That happened after 110–112, after 112's land,
after 116, and in 149. Each time the watcher was down until someone noticed, and
no task ran in the meantime.

An installed package is never flagged stale. Its `dist/` mtimes come from the
published tarball, so `src/` never looks newer and the stale check passes. An
upgrade therefore leaves the old code running until a human restarts the
watcher by hand.

M3 runs osq on its own server, where nobody keeps a terminal open. A watcher
that dies there, or that waits for a human at a keyboard, is a watcher that is
not running. `systemd --user` may be missing under WSL2, so a unit manager is
not something osq can rely on to keep it up either.

## Decision

1. **One supervisor per project.** `osq watch --background` starts it and
   `osq watch --stop` stops it. The supervisor runs the watcher as a child
   process and restarts it after a crash with a backoff from `config.watch`:
   it starts at `watch.restartDelaySeconds` and doubles up to
   `watch.restartMaxDelaySeconds`, resetting after a healthy run. It restarts
   at once, with no delay, when the worker exits 75 on a new build.
2. **The worker decides, and only between passes.** The worker checks the build
   at the points where the stale check runs, at the top of a cycle and before a
   task is picked up and before archive, so a running task and its outcome
   always finish first. On a stale build the worker waits and says so instead
   of exiting; on a settled new build it exits 75, and the supervisor starts a
   new worker that loads the new code.
3. **Records and the log live under `~/.osq/watch/<hash>/`.** `service.json`,
   `watcher.json`, and `watch.log` are keyed by a hash of the project's real
   path, and a record counts only while its pid is alive, so a killed process
   needs no cleanup by hand.
4. **One watcher per project.** Every `osq watch` refuses to start while
   another live watcher record exists for the project, so a terminal watcher
   and the service never run tasks side by side.
5. **The service never builds osq and never runs git.** It only starts and
   stops the watcher. Building and landing stay with a human and `osq land`, as
   ADR 003 requires.

## Consequences

- The supervisor's own code changes only when the service is stopped and
  started, because a restarted worker loads the new build while the supervisor
  keeps the code it started with.
- A multi-project supervisor and remote access build on these records: every
  service already keeps its state in one folder under `~/.osq/watch/`, so a
  later supervisor can list and drive them.
- Starting at login is not provided. A service started from a shell does not
  come back after the machine reboots.

## Rejected

- **A generated `systemd --user` or launchd unit.** It only works where a unit
  manager exists, it may be missing under WSL2, and osq would own two ways to
  run the same watcher.
- **Restarting on every `src/` change, as `--dev` does.** That reloads
  mid-task, which can kill a running task and leave a half-written result,
  where the service restarts only between passes and after a build has settled.
