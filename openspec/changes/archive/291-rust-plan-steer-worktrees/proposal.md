---
title: Rust osq plan steers changes in worktrees and archived changes
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-config, rust-vcs]
---
## Goal

With git on, most changes that need steering sit in an osq worktree, and a
stopped land leaves its change archived there. Rust `osq plan <id>` (278)
steers only active changes in the checkout with vcs off. This change makes
it read the config and, with vcs on, find the change across the checkout
and its osq worktrees, active first, then archived ones that need steering.
It writes TypeScript's prompt into the change's folder in its own tree,
with the tree's root in the "runs in" line, the configured default branch
in the approval line and, for a requirement that moved on that branch, the
requirement's text read from it. An approved worktree change that needs no
steering is refused with TypeScript's text. The expected text comes from
TypeScript itself: goldens printed by the built `dist` from scratch
repositories built from the fixture in this change folder, which task 1
copies into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, the link gates and the mutation check of the
changed lines included. It proves that the Rust steering prompt and
handoff equal TypeScript's for a blocked worktree task, requirements that
moved on the default branch, an archived land stop and a checkout conflict
with git on, that a healthy worktree change is refused, and that the vcs
off goldens of 278 still pass.

## Non-goals

- Starting the planner and auto-steer.
- Stacked approvals. Their trees are left out of the lookup, so a stacked change is refused as one that needs no steering.
- Resuming or creating a change for an id that needs no steering in the checkout; Rust still refuses it.

## Surface

None

## Decisions

- ADR 022: plan stays one feature crate. It lists trees through rust-storage's `change_trees` and `list_tree_changes`, as its next-number code does, and calls no other feature.
- ADR 023: picking the change, the changed requirement names and the requirement blocks are pure functions; one orchestrator reads the config, git and the files, and writes `plan-prompt.md`.
- ADR 024: every public item ends its doc with `Implements: rust-plan/<requirement>`, and each test names `Covers: rust-plan/<scenario>`.
- ADR 025: plan reads today's `.run/base` and `.run/requirements-base` markers and writes only `plan-prompt.md` in the steered folder.
- ADR 026: deltas and living specs are parsed with the specs kernel's `parse_delta` and `parse_living_spec`, whose `raw` text equals TypeScript's.
- ADR 027: no scheduling changes.
- ADR 028: `PlanFeature`'s commands and usage do not change.
- ADR 029: `vcs.enabled`, `vcs.defaultBranch` and the git timeouts come from `osq.toml` through the config kernel.

## Assumptions

- A checkout change that needs no steering is still refused with 278's text, where TypeScript resumes it; only a worktree change gets TypeScript's "approved and needs no steering" error.
- Every golden was printed by `golden/print-steer-worktree-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-22.

## Contract

### Requirement: Steering in worktrees

See `specs/rust-plan/spec.md`, with the MODIFIED "Steering lookup",
"Steering prompt" and "Steering handoff".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-plan/spec.md`: MODIFIED "Steering lookup", "Steering prompt" and "Steering handoff"; ADDED "Steering in worktrees".
- `fixture/steer-worktrees/` holds the fixture, and `golden/` the goldens, that task 1 copies to `crates/features/plan/tests/fixtures/steer-worktrees/` and `crates/features/plan/tests/fixtures/steer-worktrees-golden/`.
