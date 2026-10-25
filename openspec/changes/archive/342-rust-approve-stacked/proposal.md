---
title: Rust osq approve stacks a change on the approved changes it overlaps
depends_on: ["325"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-storage, rust-vcs, rust-config, rust-specs]
---
## Goal

With parallel lanes, a change often shares a capability with one that is
already approved, or names an approved one in `depends_on`. TypeScript's
approve stacks such a change: it seals a copy under the worktree root's
`.stacked/<folder>` with a `.run/stacked-on` naming what it waits for, and
the watcher starts it once those land. Rust approve still refuses it with
"Rust approve does not stack approvals yet". This change makes Rust approve
record the same stacked approval, with the same selection, files and text as
TypeScript, including TypeScript's rule that a change overlapping a chain
stacks only on the chain's tip.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy and every Rust
test.

- Approve's `approve_stacked` test runs one stacked change, a chain of two,
  a declared dependency and a kept rejected branch on scratch repositories.
  It compares each with goldens that TypeScript's built `dist` printed.
- Approve's rewritten `approve_stacking` test covers what a stacked approval
  waits for: every row of the old refusal table, now approved, plus the
  change's own `.run/stacked-on` lines.

## Non-goals

- Running, rejecting or landing stacked changes in Rust, and restoring a
  stacked approval to a draft.
- Rust's approve lookup still lists no stacked folders, so a stacked change
  whose checkout copy is gone is not found again, as before.
- The digest, notices, `.run/manifest.json`, `.run/plan.jsonl` and the
  `No planning record found` line, which Rust approve writes for no change.
- A CLI test. `run_cli` prints the feature's output unchanged, as the
  existing approve CLI tests prove.

## Surface

- Changed: `osq approve <id>` (Rust) with git on stacks a change that
  overlaps or depends on an approved one. It writes
  `<worktreeRoot>/<repo>/.stacked/<folder>/openspec/changes/<folder>/` with
  `.run/approved`, `.run/approver` and `.run/stacked-on`, and prints
  `  Waiting for: <folders>`, `  Runs after <folder>, which also writes <capabilities>`
  and `  Stacked: <path>`, as TypeScript does.
- Removed: Rust approve's refusal
  `Change <folder> would stack on <folders>. Rust approve does not stack approvals yet.`

## Decisions

- ADR 022: approve stays one crate; it reads other changes' state from git and files, as the refusal it replaces did, and calls no other feature.
- ADR 023: the selection is small named functions over the reads; only the stacked approval's orchestrator writes.
- ADR 024: every changed public item names `rust-approve/stacked-approval`, and no tag names the removed requirement.
- ADR 025: `.run/stacked-on`, `.run/approved` and `.run/approver` keep TypeScript's bytes, `stacked-on` with no final newline, so the TypeScript watcher runs a change Rust stacked.
- ADR 026: approve validates the change in the specs kernel before it stacks it, as it validates any change; stacking reads delta capabilities only as folder names under `specs/`.
- ADR 028: no command is added; `approve` keeps its one command and its arguments.
- ADR 030: a stacked approval appends no event, as TypeScript's appends none; nothing reacts to it yet.
- ADR 027: it schedules the Rust loop, not approve. Approve still stacks by capability overlap as TypeScript does, because the TypeScript watcher runs these changes until the Rust loop replaces it.
- ADR 029: approve reads `vcs.worktreeRoot`, `vcs.defaultBranch` and the git timeouts from `osq.toml` through the config kernel, as before.

## Assumptions

- The brief asks for the same "branch, worktree" as TypeScript. TypeScript's stacked approval makes neither; the watcher makes them when the change starts. So Rust makes neither, and the goldens show it.
- A `.stacked/<folder>` left behind hides that change's checkout draft from TypeScript's lookup, so the goldens never hold one. Rust's lookup lists no stacked folders, so the Rust-only scenario "Stacked folder replaced" covers replacing it.

## Contract

### Requirement: Stacked approval
Rust approve stacks a change TypeScript would stack, writing the stacked
copy and output TypeScript writes.

#### Scenario: Stacked approvals equal TypeScript's
- **WHEN** a human runs Rust `osq approve <id>` on a change that overlaps an approved change, a chain of them, or depends on one
- **THEN** the stacked copy, its `.run/` files and the output equal TypeScript's golden, and no branch, worktree or tree record line is made

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-approve/spec.md`: REMOVED "Stacked approval refusal", ADDED "Stacked approval", MODIFIED "Worktree approval" (one sentence: it runs only when nothing is awaited) and "Rejected branch claim" (it renames before stacking, as TypeScript does).
- `golden/print-stacked-goldens.mjs.txt` printed the four goldens beside it from TypeScript's `dist`. Copy it to a `.mjs` file before running it.
- One task; no file is shared.
