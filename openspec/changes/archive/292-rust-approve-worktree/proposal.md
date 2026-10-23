---
title: Rust osq approve moves an approved change into its own worktree
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-harnesses]
---
## Goal

With git on, TypeScript approves a change by sealing it, committing it on
its own `osq/<folder>` branch and moving it into an osq worktree, so the
watcher runs it beside other changes. Rust approve (250) only writes the
checkout's marker, so Rust can't start a parallel run. This change makes
Rust `approve` read `osq.toml` and, with git on, do what TypeScript's
`approveIntoWorktree` does for a change that does not stack: create the
branch and worktree, run `vcs.prepare`, copy and seal the folder, record
`.run/base` and `.run/approver`, commit, append TypeScript's lines to
`.git/osq-trees.jsonl` so `--follow` and `serve` see the new worktree,
and remove the checkout's draft. It refuses what TypeScript refuses
before writing, with TypeScript's text: a HEAD off the default branch,
dirty files in task scope, and a taken branch, and it adds `--base-ok` and
`--ignore-dirty`. It claims a rejected branch as TypeScript does.

Task 1 gives the vcs kernel the two writes this needs: a safe
`delete_branch` and the tree record. The expected results come from
TypeScript itself: goldens printed by the built `dist` on scratch git
repositories built from the crate's existing `approve-repo` fixture. Task
2 copies them into the crate.

### Differences from TypeScript

The Rust port improves on TypeScript where that helps, and each
difference is named in the delta too:

- A failed `vcs.prepare` rolls back: Rust removes the new worktree, prunes it, records the prune and deletes the new branch with `branch -d` before it reports the failure, so a second `osq approve` needs no cleanup. TypeScript leaves both behind. The deletion is safe under ADR 003 because prepare runs before the copy and the approval commit, so the branch still points at its base with no commit of its own, and `branch -d` refuses any branch HEAD does not hold.
- A change TypeScript would stack is refused with a Rust-only message, before any write; a draft's `.run/stacked-on` lines are not read.
- A rejected branch is renamed after the stacking check instead of before it, so a refused change renames nothing.
- No `.run/manifest.json`, `.run/plan.jsonl` or digest lines, as 250 left them out, and prepare runs with the verify role's environment.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that Rust approve leaves the same
branches, worktrees, checkout copy, approval commit, tree record and
worktree `.run` files as TypeScript on every golden row, that a failed
prepare leaves no branch or worktree and a second approve succeeds, that
every refusal leaves git and the files as they were, that a stacking
change is refused, that the vcs kernel's branch deletion never loses a
commit, and that every earlier approve, reject and vcs test still holds.

## Non-goals

- Stacked approvals: a change TypeScript would stack is refused instead.
- Steered re-approval, the default-branch steering paths, and changes found only in a worktree or a stacked approval; the lookup stays on the checkout's active changes.
- The approval digest and its flags line, notices, `--confirm`, planning-session observation (`.run/plan.jsonl`), price gaps and `.run/manifest.json`, as 250 left them out.
- Tree record lines from any other Rust feature's git writes, such as land's fast-forward or retry's commit.
- The live-planner refusal for a planner `osq plan --run` started.
- The prepare role's own environment allowlist; the Rust config does not read `confinement` yet.

## Surface

- Added: `osq-rs approve --base-ok` (flag)
- Added: `osq-rs approve --ignore-dirty` (flag)

## Decisions

- ADR 022: approve stays in its own crate and reaches git only through the vcs kernel's `GitVcs`, config through `load_config`, the prepare command through the harnesses kernel's `run_verify`, and other changes through the storage kernel's `change_trees` and `list_tree_changes`; the tree listing is a copy of the plan feature's, since a feature never calls another. Branch deletion and the tree record live in the vcs kernel, not in the feature.
- ADR 023: paths, refusal texts, the kept-branch name, the stacking folders, the record line and the output are pure functions over plain values; one orchestrator does the git and file writes in order.
- ADR 024: every public item and requirement function ends its doc with `Implements: rust-approve/<requirement>` or `Implements: rust-vcs/<requirement>`, and each test names `Covers:` with its scenario.
- ADR 025: the worktree copy's `.run/approved`, `.run/base` and `.run/approver` and the `.git/osq-trees.jsonl` lines hold today's bytes; settings come from `osq.toml`.
- ADR 026: validation still runs only through the specs kernel, before any git write, and `depends_on` is read with the specs kernel's `read_proposal`.
- ADR 027: the scheduling rule is unchanged; refusing a stacking change keeps every Rust-approved worktree free of an unfinished dependency.
- ADR 028: `ApproveFeature` stays a unit struct with its two commands; only the `approve` usage gains the two flags.
- ADR 029: approve reads `vcs.enabled`, `author`, `worktreeRoot`, `defaultBranch`, `prepare` and `manualEdits`, and the git and verify timeouts, through the config kernel; with no `osq.toml` it behaves exactly as before.

## Assumptions

- A failed prepare is a failed step after the first writes, not a refusal; its rollback restores git to the state before the run, and every refusal still comes before the first write.
- The rollback's `worktree prune` drops git's record of any other worktree whose folder is already gone, as it does whenever osq prunes.
- Every golden was printed by `golden/print-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22; the approval line is compared without the digest's ` with <flags>` suffix, and each tree record `at` is written as `<at>`. `prepare-fails-001.txt` keeps TypeScript's branch and worktree; Rust matches only its message.
- `Cargo.lock` changes only because task 1 adds `serde_json` to the vcs crate and task 2 adds three workspace crates to the approve crate; no task scopes it, since the watcher lets a lock file follow a manifest in scope.

## Contract

### Requirement: Worktree approval

See `specs/rust-approve/spec.md`, with "Approve feature", "Approve
arguments", "Approval refusals with git on", "Rejected branch claim" and
"Stacked approval refusal", and `specs/rust-vcs/spec.md`, with "Branch
deletion" and "Tree record".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: ADDED "Branch deletion" and "Tree record".
- `specs/rust-approve/spec.md`: MODIFIED "Approve feature" and "Approve arguments"; ADDED "Worktree approval", "Approval refusals with git on", "Rejected branch claim" and "Stacked approval refusal".
- `golden/` holds the goldens and the script that printed them; task 2 copies the goldens to `crates/features/approve/tests/fixtures/approve-worktree/`.

Shared files: tasks 2 and 3 share
`crates/features/approve/src/approve.rs`,
`crates/features/approve/src/approve/worktree.rs` and
`crates/features/approve/src/approve/worktree/text.rs`, which task 3
extends with the flags, the refusals and the kept-branch line. Tasks 3 and
4 share `crates/features/approve/src/approve/refuse.rs`, where task 4 adds
the stacking check last. Tasks run in order 1, 2, 3, 4.
