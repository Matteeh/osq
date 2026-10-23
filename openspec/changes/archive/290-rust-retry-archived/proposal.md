---
title: Rust osq retry retries a task or land stop of an archived change
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-vcs]
---
## Goal

A change can fail after it archives: `osq land` syncs the default branch,
its verify goes red, and the archived change in its worktree holds
`.run/regressed/change.md`. TypeScript clears that land stop with `osq
retry <id> change` and commits the retry on the change's branch, so the
next land syncs again. Rust retry (277) reads only the checkout's active
changes, so it reports the change as not found. This change makes Rust
retry fall back, as TypeScript's `findRetryChange` does, to an archived
change an osq worktree holds. It clears its land stop with TypeScript's
markers, event, text and commit, and refuses a numeric target on it with
TypeScript's text. The expected results come from TypeScript itself:
goldens printed by the built `dist` on scratch git repositories, built
from a fixture in this change folder that task 1 copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that Rust retry leaves the same archive
`.run` tree, branch tip and worktree status as TypeScript on every golden
row, that a failed commit puts the files back, and that every earlier
retry golden still holds.

## Non-goals

- Recertifying a `scope_regression` by scope hash.
- Stacked changes, active changes in an osq worktree, and the uncommitted-plan-edits check.
- Retrying a task of an archived change; TypeScript refuses it too.

## Surface

None

## Decisions

- ADR 003: retry commits only on the archived change's own `osq/<folder>` branch, in its worktree, through the vcs kernel; it never touches main or rewrites history.
- ADR 022: retry stays in its crate and reads trees through the storage kernel's `change_trees` and `list_tree_changes`; the worktree test is a copy inside the crate, since a feature never calls another.
- ADR 023: the commit paths and messages are pure functions; one orchestrator commits and restores.
- ADR 024: every public item ends its doc with `Implements: rust-retry/<requirement>`, and each test names `Covers: rust-retry/<scenario>`.
- ADR 025: the archived change's `.run` markers and `change.jsonl` are renamed and appended exactly as for an active change.
- ADR 026: marker frontmatter is still read through the specs kernel's `parse_frontmatter`.
- ADR 027: no scheduling changes.
- ADR 028: `RetryFeature` keeps its one command; only its lookup widens.
- ADR 029: retry reads `vcs.enabled`, `vcs.author` and the git timeouts from `osq.toml` through the config kernel, and loads config only when no active change matches.

## Assumptions

- Config is loaded only after the active lookup fails, so a bad `osq.toml` still refuses only archived lookups; TypeScript loads config first and fails every retry on it. This keeps every 277 golden unchanged.
- No stacked folders are listed, because TypeScript keeps only archived changes of worktree trees; this also keeps `HOME` out of the tests.
- A failed commit restages the restored paths instead of TypeScript's `discard`, which the vcs kernel lacks; both leave the worktree status empty.
- The commit-failure message is compared by its prefix only, since git's error text reaches TypeScript and Rust through different wrappers.
- Every golden was printed by `golden/print-archived-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22.

## Contract

### Requirement: Archived retry

See `specs/rust-retry/spec.md`, with "Retry command", "Retry refusals" and
"Archived retry".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-retry/spec.md`: MODIFIED "Retry command" and "Retry refusals"; ADDED "Archived retry".
- `fixture/archived-project/` holds the archived change folders, and `golden/` the goldens and their script, that task 1 copies to `crates/features/retry/tests/fixtures/`.
