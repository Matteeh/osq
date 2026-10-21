---
queue_item: rust-config-kernel
queue_hash: sha256:9e52c12a5caf4a2dccc0567e16a80370fad3e5663c4ee0ccfd22080d2b40f5db
planner: null
date: 2026-10-21
---

### Goal

Three Rust kernels already wait on config: the git timeout, the inbox's `vcs.enabled` items and the runners' role settings. A config kernel reads `osq.toml` into typed values with TypeScript's defaults, so each can take its setting from config instead of the caller.

### Context

As of 2026-10-21:

- ADR 025: `osq.config.ts` becomes a hand-written `osq.toml` at the switch. No config crate exists. ADR 022 sets the crate layers; a new kernel crate needs its own capability.
- TypeScript: `DEFAULT_CONFIG` and `loadConfig` in `src/core/foundation/config.ts`, with one `config-*.ts` file per block.
- Waiting on it: "Git read timeout from config" (241 and 245), the archived-not-landed inbox items (244), and the role settings `rust-runners-roles` takes as a typed value.

### Requirements

- An ADR names where config lives in the crate layers, the TOML dependency (through the dependency gate) and how a missing file falls back to TypeScript's defaults.
- A config kernel reads `osq.toml` into typed settings for `timeouts`, `vcs`, the roles (`executor`, `planner`, `validator`) and `maxConcurrency`, with TypeScript's default for each value it leaves out. An unknown key or a wrong type is a typed error naming the key.
- Tests cover a missing file, a full file, each default and each error.

### Non-goals

- Reading `osq.config.ts`, the rest of the config blocks, and wiring the setting into the vcs, inbox or runners crates; each gets its own item.
