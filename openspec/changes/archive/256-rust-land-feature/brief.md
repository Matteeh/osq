---
queue_item: rust-land-feature
queue_hash: sha256:c76bd6f6e015e5819df804ec905d0f46c6ff89cfa2067e20cc2acd37294995cb
planner: null
date: 2026-10-21
---

### Goal

Rust can approve and archive a change but not land it. The land feature should put an archived change's verified tree onto the default branch as one commit, as TypeScript's `osq land` does, so a Rust run can finish a change.

### Context

As of 2026-10-21:

- `crates/features/land` is a placeholder; `rust-land` holds only its Code ownership.
- The vcs kernel has `commit_tree`, `fast_forward`, `is_ancestor`, `count_commits` and the branch and worktree writes (241, 245).
- TypeScript: `landChange` in `src/core/vcs/land.ts`, its checks in `land-checks.ts`, and the version-control requirements "Land refusals", "Land from the verified tree", "Land reports changed paths" and "Land cleanup".
- Rust cannot read worktrees or `osq.toml` yet, so the caller gives the checkout, the change's branch and the author.

### Requirements

- `land <id>` refuses as TypeScript does when the checkout is on another branch, not clean, or an earlier change is unlanded, with TypeScript's messages.
- It commits the change branch's tree onto the default branch as one commit with TypeScript's message and trailers, fast-forwards the checkout, and prints the changed paths.
- Tests run on scratch git repositories, with no network.

### Non-goals

- Stacked changes and the bridge commit, sync with a newer default branch, push to origin, the after-land command, worktree cleanup, and steering stops; each is a later item.
