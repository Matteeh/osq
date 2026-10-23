---
title: Rust reads pi's settings from osq.toml
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-config, rust-harnesses]
---
## Goal

`PiSettings` and the pi program come from the caller, because no config
reader existed when the pi harness landed in 251. This change reads an
optional `[pi]` table in `osq.toml` in the config kernel, with the checks of
TypeScript's `validatePiConfig`, and lets the harnesses kernel build a
`PiHarness` straight from the loaded `Config`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, the corpus link gates included, so it proves both new
tests pass and the existing config and harness tests still do.

## Non-goals

- osq doctor's pi checks.
- Other harnesses' settings.
- Choosing pi's model from `OSQ_MODEL`; the request's model already overrides the settings' model.

## Surface

- Added: `[pi]` table in `osq.toml` with the keys `bin`, `provider`, `model` and `thinking` (config keys), as `pi` in `osq.config.ts` holds them.

## Decisions

- ADR 022: the harnesses kernel depends on the config kernel, a kernel-to-kernel dependency; no feature is involved.
- ADR 023: `read_pi` sits in its own block file beside `vcs.rs`, reusing the shared value readers.
- ADR 024: every new public item ends its doc with `Implements: rust-config/pi-settings` or `Implements: rust-harnesses/pi-harness-from-config`, and each test names its `Covers:` scenario.
- ADR 025: the `pi` keys keep TypeScript's names.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: no Feature changes; the harness is built by whoever runs a task.
- ADR 029: `PiConfig` is typed, defaults to every field unset, and a bad key or value is a `ConfigError` naming `pi.<key>`.

## Assumptions

- The errors follow the config kernel's shared string rule, `pi.bin must be a string` or `pi.bin must be a non-empty string`, not TypeScript's single text `pi.bin must be a non-empty string if provided`. The rule and the key match TypeScript; only the wording follows the kernel, as `vcs` already does.
- Task 2 runs after task 1, since it uses `PiConfig`; the tasks share no file.

## Contract

### Requirement: Pi settings

See `specs/rust-config/spec.md`.

### Requirement: Pi harness from config

See `specs/rust-harnesses/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-config/spec.md`: ADDED "Pi settings"; MODIFIED "Config file", which adds `pi` to the top-level keys and `Config`'s fields and keeps its five scenarios.
- `specs/rust-harnesses/spec.md`: ADDED "Pi harness from config".
