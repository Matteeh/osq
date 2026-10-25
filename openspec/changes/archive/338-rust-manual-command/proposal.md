---
title: Rust osq manual keeps uncommitted edits as a manual change
depends_on: ["326"]
verify: cargo test -p osq-feature-manual -p osq-cli
creates:
  - name: rust-manual
    group: rust
features:
  reads: [rust-core, rust-config, rust-vcs, rust-specs, rust-storage, rust-loop]
---
## Goal

`osq manual "<comment>" [paths...]` is how a human keeps a hand edit on the
default branch: one commit with the comment, and a record under
`openspec/manual/` naming the capabilities the edit touched, which the next
planner's prompt lists. Rust storage already reads those records and the
Rust plan prompt prints them, but Rust has no `manual` command. This change
adds the `osq-feature-manual` crate, its own capability `rust-manual`, with
TypeScript's selection, refusals, record, commit and output lines, and
registers it in the CLI.

## Verify

`cargo test -p osq-feature-manual -p osq-cli` runs every test of the new
crate and of the CLI. It proves the command's data and argument errors,
every refusal and every keep against dumps that TypeScript's `dist` printed
on the same scratch repositories, that rust-storage reads the record back,
the registry order, and `manual` through `run_cli`. The watcher also runs
cargo-mutants on the touched lines.

## Non-goals

- Manual edits inside a worktree: TypeScript keeps edits only in the
  project root's checkout, and so does Rust.
- Fixing TypeScript's two commit gaps, which Rust keeps (see Assumptions).
- A `paths.openspecRoot` setting; Rust osq reads `openspec/` as every Rust
  feature does.

## Surface

- Added: `osq-rs manual <comment> [paths...]` (command), TypeScript's
  `osq manual` in Rust.

## Decisions

- ADR 022: manual is its own feature crate on the kernels: config, vcs, specs and storage. It calls no other feature.
- ADR 023: small named functions, with the git and file IO in thin orchestrators, and a doc comment on every item.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: the record, commit and output are TypeScript's, byte for byte; the block refusal names `osq.toml`, the file Rust reads, where TypeScript names `osq.config.ts`.
- ADR 026: ownership comes from the specs kernel's `read_capability_ownership` and `owner_capabilities`.
- ADR 027: no scheduling change.
- ADR 028: `ManualFeature` lists one command as data, and `at(now_ms)` fixes its clock for tests, as `PlanFeature::at` does.
- ADR 029: `vcs.enabled`, `vcs.author` and `vcs.manualEdits` come from `load_config`.
- ADR 030: manual appends no event and reacts to none; `run_cli` runs it through the loop kernel's entry point like every command.

## Assumptions

- TypeScript cannot keep a staged rename: its `git add -- <paths>` names the rename's source, which neither the index nor the folder holds, and git refuses it. Rust's vcs port `commit` runs the same `add`, so the `rename` case fails in both, and the goldens pin only that it fails, not git's text. Fixing it means changing rust-vcs `commit`; that would be a later queue item for both languages.
- When git refuses the commit, as with a failing pre-commit hook, TypeScript removes the record but leaves it and the kept paths staged in the index. Rust does the same, and the `commit-fails` golden shows it.
- `golden/cases.json` drives both TypeScript's script and the Rust tests, so each case is set up the same way in both.
- Scratch folders live under `std::env::temp_dir()`, not `CARGO_TARGET_TMPDIR`, because `target/` sits inside this repository and the `no-git` case needs a folder in no repository.

## Contract

### Requirement: Manual keep

See `specs/rust-manual/spec.md`, "Manual command", "Manual refusals" and
"Manual keep", and `specs/rust-cli/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-manual/spec.md`: new capability; ADDED "Code ownership", "Manual command", "Manual refusals" and "Manual keep".
- `specs/rust-cli/spec.md`: MODIFIED "Feature registry"; ADDED "Manual through the CLI".
- `fixture/manual-project/` is the scratch project, and `golden/` holds `cases.json`, `print-goldens.mjs.txt` and one dump per case that TypeScript's `dist` printed. Task 1 copies both to `crates/features/manual/tests/fixtures/`.
- Tasks 1 and 2 share `crates/features/manual/**`: task 2 extends task 1's sources, `Cargo.toml` and `tests/support/mod.rs`.
