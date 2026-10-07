---
queue_item: watch-service
queue_hash: sha256:6ec6e592e732e47896c8c5e89002447aae74a0e3192b64f5bef96eaa23b05d11
planner: null
date: 2026-10-06
---

### Goal

The watcher runs as a background service: no terminal kept open, restarted if it crashes, and restarted on a new osq build instead of stopping and waiting for a human. This is M3 item 1, the first step toward osq on its own server, and it ends the stale-build class of incidents.

### Context

As of 2026-10-05:

- `osq watch` is a foreground loop (`src/cli/watch.ts`). `--dev` runs a supervisor (`src/watcher/dev.ts`) that respawns a `tsx` worker when `src/` changes.
- Stale builds: `startStaleCheck` (`src/watcher/stale-pass.ts`) refuses to start when `dist/` is older than `src/`. When a pass finds that, it throws `StaleBuildError`, and the loop stops (`src/watcher/loop.ts`). A human must run `pnpm build` and restart the watcher. That has happened after 110–112, after 112's land, after 116 (115 looped on the bug 116 fixed), and in 149. An installed package has no `src/` and is never flagged stale, but upgrading it leaves the old code running.
- osq survives a restart: state is marker files, and a restarted watcher reaps a stale running lock and retries the task.
- The help groups `watch` under "Setup and running" (`src/cli/help-groups.ts`). The ROADMAP's simple-surface principle says "`watch` becomes a background service".
- The author runs osq under WSL2, where `systemd --user` may not be available.

### Requirements

- One command starts the watcher for a project in the background, and one stops it. The service outlives the terminal that started it and restarts the watcher if it crashes, with a backoff from config.
- When the osq build it runs changes, the service restarts the watcher between passes, never while a task is running. When `dist/` is older than `src/`, it waits and reports that, instead of exiting.
- `osq` (the inbox) and `osq status` say whether the service is running, and which build it runs.
- The service's output goes to a log file whose path `osq status` prints.
- Every limit and timeout comes from config.

### Non-goals

- One supervisor for several projects; a later step.
- Remote access, authentication or containers (M3 items 2 and 3).
- Building osq itself: the service never runs `pnpm build`.

### Notes for planning

- Decide in the proposal how the service runs: osq's own detached supervisor with a pid file under `.run/` or `~/.osq` (no new dependency, works without systemd), or a generated `systemd --user` or launchd unit. Starting at login is in scope only if it comes for free.
- Prefer flags or subcommands on `watch` over new top-level commands; the simple surface counts every command a user has to learn.
- Say whether this needs an ADR. M3's server work builds on how the service runs.
