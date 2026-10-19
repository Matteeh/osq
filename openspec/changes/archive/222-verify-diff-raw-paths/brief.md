---
queue_item: verify-diff-raw-paths
queue_hash: sha256:2a95b68fcfb84e43e6d093788c0e63d8c9c802a8d76617a17993497a9147d149
planner: null
date: 2026-10-19
---

### Goal

A change that adds a file with a non-ASCII name still passes the mutation step of `scripts/verify-rust.sh`. 221 can then be retried as planned.

### Context

As of 2026-10-19:

- 221 task 1 died `change_verify_red` with cargo-mutants' "ERROR Failed to parse diff: invalid escaped character". The diff comes from `OSQ_DIFF`, which `prepareVerifyDiff` (`src/core/run/verify-diff.ts`) builds with `patch()` in `src/core/vcs/git-vcs-write.ts`. That function runs `git diff --cached --binary` with git's default path quoting, so the 221 fixture paths `seal-fixtures/unicode-order/a-｡.md` and `a-😀.md` come out as octal escapes in quotes.
- Tested by hand on 221's worktree: `git -c core.quotepath=false diff --binary <base> HEAD` parses in `cargo mutants --list --in-diff` ("Diff changes no Rust source files"), and `git apply --check -R` accepts the same diff. The default diff fails to parse.
- `patch()` also writes the dead attempt's `.patch` (`src/core/run/dead-commit.ts`) and feeds the validator (`src/watcher/validator-inputs.ts`). Raw paths suit both, since `git apply` reads them.
- In attempt 2, the executor ran `git add -A` itself to work around the parse failure and died `vcs_violation`. The worktree index still holds those staged files.

### Requirements

- Every diff `patch()` returns names paths as raw UTF-8, with no octal quoting, whatever the repository's own `core.quotepath` is.
- A test makes a change that adds a file with a non-ASCII name and checks that the diff names the raw path and that `git apply` applies it.

### Non-goals

- Changing `scripts/mutants-rust.sh` or narrowing `OSQ_DIFF` to Rust files.
- Other git commands that print paths.
