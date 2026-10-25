---
queue_item: rust-sync-kernel
queue_hash: sha256:330296234437889583177534800d0bacc16aa60ce7f8a98d1cc57a382bc08b43
planner: null
date: 2026-10-25
---

### Goal

Taking the default branch into a change's branch is shared work: land does it today, approve needs it to recover a default-branch stop, and the Rust loop's run and archive gates will need it before spawn and before archive (Loop design brief, 2026-10-24). It moves out of the land feature into a kernel crate, so every caller gets the result in its own command and can decide what a conflict means.

### Context

As of 2026-10-25:

- The sync is `crates/features/land/src/land/sync.rs` and its 12 modules under `sync/`: the requirements check, merge, spec and lockfile rebuild, prepare, verify, recertification, the stop record and the `synced`/`sync_stopped` events. `sync_command.rs` adds the `sync` command's refusals.
- ADR 022 lists the kernels and says features never call each other. ADR 030 rejects a kernel made for one caller; this one has land and approve now, run and archive later.
- 326 (2026-10-24) and the Loop design brief: a conflict should reopen only the tasks that own the conflicted files, so the caller needs the conflicted paths back, not just a failure message.

### Requirements

- A new kernel crate `osq-kernel-sync` holds the archived and active sync with its stops, records and events, and returns a typed outcome: already synced, synced with its commit, or stopped with the reason, the message and, for a conflict, the conflicted paths.
- The caller chooses whether a stop is recorded, whether verify runs, and which done tasks it verifies, as land's `Caller` and the active pick do today.
- `osq land` and `osq sync` behave byte for byte as before; every existing land test passes unchanged.
- ADR 022 lists the new kernel, through an amendment written by a task.
- The sync kernel depends only on core and other kernels.

### Non-goals

- Changing what sync does; this is a move.
- The run and archive gates that will call it.
- A merge agent.
