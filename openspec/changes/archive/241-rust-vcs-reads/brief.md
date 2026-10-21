---
queue_item: rust-vcs-reads
queue_hash: sha256:e6258ff2a42f3f11aa1cec25fc4243990ed6f006a430726d6b1b24136686dad5
planner: null
date: 2026-10-20
---

### Goal

Land, sync, approve and the loop all need git. The vcs kernel gets the read half of osq's `Vcs` port first, as a Rust trait with a git implementation, so features that only read can be built on it while the write half follows.

### Context

As of 2026-10-21:

- `crates/kernel/vcs` is a placeholder. `src/core/vcs/vcs.ts` is the TypeScript port: `root`, `head`, `status`, `defaultBranch`, `show`, `pathExists`, `mergeBase`, `isAncestor`, `countCommits`, `diffStat`, `trailerValues`, `listBranches`, `worktreeList` and `configValue` read; the rest write. `git-vcs-read.ts`, `git-vcs-parse.ts` and `git-vcs-diff.ts` hold the git commands and parsers. 222 made diffs name non-ASCII paths raw (`core.quotepath=false`).
- ADR 003: osq alone runs git. ADR 025: Rust reads today's repositories as they are.
- TypeScript tests make temporary repositories with `tests/git-test-env.ts`.

### Requirements

- `osq-kernel-vcs` holds a `Vcs` trait with the read operations above and a `GitVcs` that runs the `git` program, with the same arguments and parsing as the TypeScript functions, `core.quotepath=false` included.
- Every operation is tested on a temporary repository the test builds under `CARGO_TARGET_TMPDIR`, with no network and no global git config read.
- A path, branch or ref that does not exist gives the same empty or `None` answer TypeScript gives, and a git failure is a typed error naming the command.
- No new crate dependency, unless it goes through the dependency gate with its ADR.

### Non-goals

- Any write operation: commit, merge, worktree add or remove, branch create, push.
- `NoVcs`, doctor checks and line endings.
