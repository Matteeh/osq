---
title: Rust gains empty show, lint, doctor and retry feature crates, registered in the CLI
depends_on: []
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-show
    group: rust
  - name: rust-lint
    group: rust
  - name: rust-doctor
    group: rust
  - name: rust-retry
    group: rust
features:
  reads: [rust-core]
---
## Goal

Every new feature crate edits the root `Cargo.toml` and the CLI's
`features()` registry, so changes that each add a crate overlap and run one
at a time. This change adds the four crates the next queue items need,
`osq-feature-show`, `osq-feature-lint`, `osq-feature-doctor` and
`osq-feature-retry`, each its own capability with an empty `Feature`, and
registers them. After it lands, `rust-show`, `rust-lint-command`,
`rust-doctor-pi` and `rust-retry` each touch only their own crate and can run
side by side.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the link gates included. It proves the four crates
build, each empty feature behaves as its spec says, the registry lists them,
and every new file is owned by exactly one capability.

## Non-goals

- Any command; each crate gets its command in its own queue item.
- Dependencies beyond `osq-core`; each item adds what it needs.

## Surface

None

## Decisions

- ADR 022: each feature is one crate and one capability, depending only on core; the app crate only lists them.
- ADR 023: the empty features are unit structs with a doc comment on every item.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each test names `Covers: <capability>/<scenario>`.
- ADR 025: no on-disk format changes.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: each crate exposes one `Feature`; with no commands, help and dispatch are unchanged.
- ADR 029: no config is read.

## Assumptions

- A feature that lists no command adds no help line, and `run_cli` never calls it, so the CLI's help and dispatch tests pass unchanged; only `registered_features` changes.
- The new features go after `ReportFeature` in the registry, so the next items can add commands without reordering.

## Contract

### Requirement: Feature registry

See `specs/rust-cli/spec.md`, and each new capability's "Code ownership" and
feature requirement in `specs/rust-show/`, `specs/rust-lint/`,
`specs/rust-doctor/` and `specs/rust-retry/`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-show/spec.md`: new capability; ADDED "Code ownership" and "Show feature".
- `specs/rust-lint/spec.md`: new capability; ADDED "Code ownership" and "Lint feature".
- `specs/rust-doctor/spec.md`: new capability; ADDED "Code ownership" and "Doctor feature".
- `specs/rust-retry/spec.md`: new capability; ADDED "Code ownership" and "Retry feature".
- `specs/rust-cli/spec.md`: MODIFIED "Feature registry".
