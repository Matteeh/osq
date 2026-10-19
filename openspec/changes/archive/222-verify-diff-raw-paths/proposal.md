---
title: The change diff osq writes names non-ASCII paths as raw UTF-8, so cargo-mutants can read OSQ_DIFF
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

A change that adds a file with a non-ASCII name still passes the mutation step
of `scripts/verify-rust.sh`. `patch()` in `src/core/vcs/git-vcs-write.ts` runs
`git diff --cached --binary` with git's default path quoting, so such a path
comes out as octal escapes in quotes. cargo-mutants then refuses `OSQ_DIFF`
with "Failed to parse diff: invalid escaped character", which killed 221 task 1.
Running that diff with `-c core.quotepath=false` names the raw path, and both
cargo-mutants and `git apply` read it (tested on 221's worktree, 2026-10-19).

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, including the new raw-path
patch test, the line budget and the import graph, and lint.

## Non-goals

- Changing `scripts/mutants-rust.sh` or narrowing `OSQ_DIFF` to Rust files.
- Other git commands that print paths.
- Undoing what 221's executor staged in its worktree; 221 is rejected.

## Surface

None

## Decisions

ADR 021: autopilot is untouched; `patch()` keeps its signature and callers.

## Assumptions

- The manual sync edit of 2026-10-18 (`src/core/vcs/sync-specs.ts`) already
  fits "Default branch sync": a living spec that never existed is neither
  written nor removed, so that requirement needs no delta here.
- `OSQ_DIFF`, the dead attempt's `.patch` and the validator's diff all come
  from `patch()`, so one fix covers all three, and `git apply` reads raw paths.

## Contract

### Requirement: Patch names raw paths

The diff `patch` returns SHALL name every path as raw UTF-8, never quoted with
octal escapes, whatever the repository's `core.quotepath` setting is.

#### Scenario: Patch with a non-ASCII path
- **WHEN** a repository with `core.quotepath` set to true has an untracked file `a-😀.md` and `patch()` runs
- **THEN** the diff holds the line `diff --git a/a-😀.md b/a-😀.md`, holds no `\360`, and applying it to a clean copy creates `a-😀.md` with the same content

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: ADDED "Patch names raw paths".

No file is shared between tasks.
