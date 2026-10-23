---
queue_item: rust-vcs-git-timeouts
queue_hash: sha256:5f90ea74ca7790d30ed0f571132690731e377ef761aa364e245250e4e7629896
planner: null
date: 2026-10-21
---

### Goal

The vcs kernel runs git with no time limit, because no config reader existed when its reads and writes landed. Each git command should be bounded by the timeout TypeScript uses for it, taken from the config kernel.

### Context

As of 2026-10-21:

- `GitVcs` in `crates/kernel/vcs/src/git.rs` runs every read and write through one private runner with no timeout (241, 245).
- TypeScript bounds reads by `timeouts.gitSeconds`, commits by `gitCommitSeconds` and remote fetches and pushes by `gitRemoteSeconds`; see `src/core/vcs/git-vcs.ts`.
- `rust-config-kernel` gives `Timeouts` with those three durations and TypeScript's defaults.

### Requirements

- `GitVcs` takes `&Timeouts` from the config kernel and bounds each command as TypeScript does; a command that runs out of time is a typed error naming the command and the limit.
- Tests use a fake git program that sleeps, with short timeouts.

### Non-goals

- Reading `osq.toml` inside the vcs kernel; the caller passes the timeouts.
