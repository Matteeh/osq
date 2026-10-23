---
title: Rust osq retry retries a task of a change running in its worktree
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-vcs]
---
## Goal

With git on, an approved change lives in its own worktree, and its dead
task's markers live there too. Rust `osq retry` finds active changes only in
the checkout, so it answers `Spec "<id>" not found` for the most common
retry. This change makes Rust retry find active changes in every osq
worktree, as TypeScript's `findChange` does. It clears the task or change
there, recertifies scope regressions with the worktree as the working
folder, and refuses while the worktree holds uncommitted plan edits.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test. The retry crate's new `retry_active` test builds scratch repositories
with worktrees and compares Rust's output, the worktree's `.run/` tree, the
branch tip and `git status` with goldens that TypeScript's built `dist`
printed. One golden covers each of these: a dead task, a change-level
regression, a scope recertification, plan edits, a tolerated `tasks.md`
edit, a draft copy in the checkout, and git off.

## Non-goals

- Stacked changes. Rust retry still lists no stacked folders.
- Starting the retried attempt. The watcher or `osq run` does that.
- Committing the retry. TypeScript commits only an archived change's retry,
  and so does Rust.

## Surface

- Changed: `osq retry <id> <task|change>` (Rust) finds active changes in osq worktrees and refuses uncommitted plan edits there

## Decisions

- ADR 022: retry stays in its crate and lists trees through the storage kernel's `change_trees` and `list_tree_changes`.
- ADR 023: finding the change, the plan-edit check and the tree root are small named functions; only the thin orchestrator in `retry.rs` does IO.
- ADR 024: every changed public item names its requirement and every new test names its scenario.
- ADR 025: retry writes the same `.run/` markers and event lines TypeScript writes, in the worktree.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: this is one task in one crate.
- ADR 028: `retry` stays the feature's only command.
- ADR 029: retry reads `vcs.enabled` and the git timeouts from `osq.toml` through the config kernel.

## Assumptions

- TypeScript checks plan edits before it checks the target. Rust checks the target first, then finds the change, then checks plan edits. The two differ only when the target is invalid and the worktree holds plan edits; Rust then names the target, which is the more useful error.
- The recertification loads config from the project root, as TypeScript does, but runs verify and hashes scope files in the worktree. The `recert-003` golden proves both: its verify passes only in the worktree, and its scope hash is of the worktree's `src/a.txt`.

## Contract

### Requirement: Active worktree retry
With git on, `retry` SHALL find an active change in its osq worktree and
retry it there as TypeScript does.

#### Scenario: Active worktree retry equals TypeScript's
- **WHEN** a test runs `retry` on a scratch repository whose change is approved in its worktree
- **THEN** the output and the worktree's `.run/` tree equal TypeScript's golden

## Human steps

None

## Delta

- `specs/rust-retry/spec.md`: MODIFIED "Retry refusals" and "Scope recertification", ADDED "Active worktree retry" and "Plan edits refusal".
- `fixture/active-project/` holds the four change folders, each with `.run/approved` sealed as TypeScript's `hashChangeFolder` seals it. `004-plan-edits` is sealed with the `tasks.md` that the golden script writes.
- `golden/` holds TypeScript's goldens, and `golden/print-active-goldens.mjs.txt` is the script that printed them. Copy the script to a `.mjs` file before running it.
