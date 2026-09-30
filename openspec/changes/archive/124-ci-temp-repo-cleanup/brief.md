---
queue_item: ci-temp-repo-cleanup
queue_hash: sha256:da2713f50294c2b66948bc3f6d158af486e57b7d7a139bb4a1f8460c745c3353
planner: null
date: 2026-09-30
---

### Goal

`pnpm verify` on the GitHub Actions runner passes whenever it passes locally. No test fails in its cleanup because something is still writing into the temp git repository the test is removing.

### Context

As of 2026-09-30:

- CI on `main` is red. Two runs each failed one test in `tests/worktree-run.test.ts`, and a different one each time: "commits a new test file outside the task scope" and "archives with a commit that leaves the worktree clean". Both failed with `ENOTEMPTY: directory not empty, rmdir '/tmp/osq-worktree-run-<random>/repo/.git/objects/pack'`. Everything else passed: 2836 of 2838, with one skipped.
- The same suite passes locally (WSL2, git 2.34.1).
- The error comes from cleanup, not from an assertion. `afterEach` in `tests/worktree-run.test.ts` runs `fs.rm(dir, { recursive: true, force: true })` over every temp root. `ENOTEMPTY` on `rmdir` means a file appeared in `.git/objects/pack` while `fs.rm` was removing it, so some process was still writing into the repository after the test's last await.
- About 300 test files clean up temp directories the same way, and many of them create git repositories.
- Nothing in `src/` or `tests/` sets `gc.auto` or `maintenance.auto`. `git commit` can start `git gc --auto` or `git maintenance run --auto` in the background, and they write packs. The runner's git is newer than the local one and may have different defaults.
- `runVerificationCommand` in `src/core/run/verification.ts` spawns verify with `detached: true`. A git child that osq times out and kills may also outlive the test.

### Requirements

- The writer is identified and named in the change: which process writes `.git/objects/pack` after a `worktree-run` test ends.
- No test's temp git repository is still being written to when the test's cleanup runs. Test repositories either never start background git work, or the test waits for it to end.
- A temp directory removal in a git-using test retries on `ENOTEMPTY` and `EBUSY` before it fails, for example with `fs.rm`'s `maxRetries`, so a late write cannot fail CI.
- `pnpm verify` passes on the GitHub Actions runner three times in a row.

### Non-goals

- Changing the git settings osq uses in a user's repository, unless the writer turns out to be osq's own code leaving a child running. Then that is a bug to fix in `src/`.
- Rewriting cleanup in test files that create no git repository.

### Notes for planning

- Reproduce first. Try `git -c gc.auto=1 commit` in a temp repository followed by an immediate `fs.rm`, and check `git config --system --list` and the git version on `ubuntu-latest`.
- A shared test helper for temp roots, such as `tests/helpers/`, may be simpler than editing each `afterEach`, but every file it touches is a preexisting test and needs `tests.modify`. Measure how many files create git repositories, and keep each task under the 8-pattern scope limit.
- If test repositories should turn off background git work, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0` in the `test` script reach every git child without editing each test. osq's own git calls pass through `childGitEnv`; check that it keeps them.
