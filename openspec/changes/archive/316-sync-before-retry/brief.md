---
queue_item: sync-before-retry
queue_hash: sha256:083695fffa348e7bdb115bb383d1107b39f80039ffdd26c3943fc32a783580f8
planner: null
date: 2026-10-23
---

### Goal

A change's worktree takes main only before its first task and before archive. A tooling fix made on main later (formatter config, verify script, toolchain) misses every running change. On 2026-10-23, 305 task 2 died six times on a biome bug that was already fixed on main. The only way to bring the fix in was a manual `osq sync`, which then raced the watcher and halted 305. The watcher should take main itself, in its own loop, before it retries a task.

### Context

As of 2026-10-23:

- The watcher syncs before a change's first task and before archive through the same code `osq sync` uses (`src/core/vcs/sync-main.ts`). A conflict or a red verify halts the change as a steering trigger.
- The watcher reads `osq.config.ts` from the checkout, but `biome.json`, `scripts/`, `package.json` and `rust-toolchain.toml` come from the worktree's branch.
- Write-up: Notion "Why 305 halted on worktree_dirty during osq sync (2026-10-23)".

### Requirements

- Before the watcher spawns any attempt after the first one of a task, automatic or after `osq retry`, it syncs the change exactly as before the first task when the default branch has moved since the last sync.
- A sync that stops halts the change as the first-task sync does, and no attempt starts.
- A test fixes a file on main after a task's first death and sees the retried attempt run on the merged tree.

### Non-goals

- Syncing before every task, or while a task runs.
- Changing the sync itself.
