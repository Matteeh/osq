---
title: Every placeholder kernel and feature crate becomes its own capability, so later Rust changes never write the same spec
depends_on: ["237"]
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-vcs
    group: rust
  - name: rust-runners
    group: rust
  - name: rust-harnesses
    group: rust
  - name: rust-agents
    group: rust
  - name: rust-plan
    group: rust
  - name: rust-approve
    group: rust
  - name: rust-run
    group: rust
  - name: rust-archive
    group: rust
  - name: rust-land
    group: rust
  - name: rust-inbox
    group: rust
  - name: rust-report
    group: rust
  - name: rust-metaloop
    group: rust
features:
  reads: [rust-linter]
---
## Goal

Rust changes can run in parallel. Today every crate a change fills in has
to leave `rust-workspace` first, so every such change modifies
`rust-workspace`'s `Code ownership`. Two of them in flight at once stop
with `requirement_changed` at sync, and land refuses the second one.

This change gives each remaining kernel and feature placeholder crate its
own capability in group `rust` now, with a Purpose from the Rust Rebuild
architecture and a `Code ownership` requirement for its crate folder.
`rust-workspace` keeps only the `cli` app. A later change that fills in
a crate then writes only its own capability's spec.

The change writes specs only. No Rust file, manifest or test changes.

## Verify

`sh scripts/verify-rust.sh`

osq runs it with this change in `OSQ_CHANGE`, so the link gates corpus
test runs `change_link_gates` with the change's deltas: each new
capability's `Code ownership` and `rust-workspace`'s narrowed one replace
the living globs, and `owned-once` proves every file of the placeholder
crates has exactly one owner. It also runs the format check, clippy and
every other Rust test, which this change leaves as they are.

## Non-goals

- Filling in any crate, or adding dependencies between crates.
- Removing `rust-workspace`; it keeps the `cli` app until the apps are built.
- Changing `rust-workspace`'s Purpose; it already says each crate leaves it when it gets its own capability.
- Any Rust source, manifest, test or ADR change.

## Surface

None

## Decisions

- ADR 022: one crate is one capability, and each new capability owns exactly its crate folder, `crates/kernel/<name>/**` or `crates/features/<name>/**`.
- ADR 023: no code changes, so the style rules have nothing new to check; each crate keeps its doc comments as they are.
- ADR 024: every new `rust` capability has a Purpose, a requirement and an owned file, so `complete-capabilities` finds nothing once the change archives, and `owned-once` holds while it runs because `rust-workspace` gives up the same globs.
- ADR 025: the new capabilities live in today's `openspec/specs/<capability>/` folders with an `osq.yml` sidecar, as every other capability does.
- ADR 026: the deltas are plain OpenSpec, which the specs kernel parses for the link gates and archive merges.
- ADR 027: a change that writes one crate now locks only that crate's capability, so the scheduler can run changes to different crates side by side and land takes them one at a time without a shared spec.

## Assumptions

- Capability names follow the queue item: `rust-<crate folder name>`, as `rust-loop` did.
- Archive writes each new capability's `osq.yml` sidecar with `group: rust` from `creates`, as it did for `rust-loop`, so the change folder holds no sidecar file.
- No test proves the new `Code ownership` scenarios by name; like `rust-workspace`'s own and `rust-loop`'s, they are proven by the link gates corpus test, and ADR 024's rules do not require a `Covers:` tag per scenario.
- The single task changes no file and starts green: the link gates corpus test passes on the living specs today and with this change's deltas, which is what it must keep doing.

## Contract

### Requirement: Code ownership

See each `specs/rust-<crate>/spec.md` and `specs/rust-workspace/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`, `specs/rust-runners/spec.md`, `specs/rust-harnesses/spec.md`, `specs/rust-agents/spec.md`: new kernel capabilities, each ADDED "Code ownership" for its crate folder.
- `specs/rust-plan/spec.md`, `specs/rust-approve/spec.md`, `specs/rust-run/spec.md`, `specs/rust-archive/spec.md`, `specs/rust-land/spec.md`, `specs/rust-inbox/spec.md`, `specs/rust-report/spec.md`, `specs/rust-metaloop/spec.md`: new feature capabilities, each ADDED "Code ownership" for its crate folder.
- `specs/rust-workspace/spec.md`: MODIFIED "Code ownership", owning only `crates/apps/cli/**`, scenario "Placeholder crate ownership" kept.

No file is shared between tasks.
