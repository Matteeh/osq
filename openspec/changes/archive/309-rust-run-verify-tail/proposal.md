---
title: The Rust run feature cuts verify output by the config limits
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses]
---
## Goal

Every limit comes from config. The Rust run verdict keeps a hard-coded
2000-byte tail of verify output in its dead markers and puts the whole
output in its `verify_ran` events. TypeScript writes the whole output to a
`.run/logs/` file, keeps a `tailVerifyOutput` tail in the event and an
`excerptVerifyOutput` excerpt in the marker, both sized by
`limits.markerOutputLines` and `limits.markerLineChars`, which 289 gave the
Rust config with TypeScript's defaults 40 and 400. This change makes the
run feature do the same and drops `OUTPUT_TAIL_BYTES`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that small limits in `osq.toml` shorten the task
and change verify excerpts and event tails, that each verify writes its
log, and that every earlier run test still holds.

## Non-goals

- Tail sizes in other crates.
- A `duration` on the run's `verify_ran` events.
- Any change to the default sizes.

## Surface

None

## Decisions

- ADR 022: the change stays in the run feature crate; it copies the excerpt logic rather than calling the retry or land feature.
- ADR 023: the excerpt and tail functions are pure leaves that take the limits as arguments; the verdict holds the log write.
- ADR 024: every public item ends its doc with `Implements: rust-run/<requirement>`, and each new test names `Covers: rust-run/<scenario>`.
- ADR 025: the dead markers, `verify_ran` events and `.run/logs/` files take TypeScript's formats.
- ADR 026: no OpenSpec parsing changes; the verdict still reads the proposal's verify with `read_proposal`.
- ADR 027: no scheduling changes.
- ADR 028: `RunFeature`'s commands are unchanged.
- ADR 029: the two sizes come from `load_config`'s `limits`, with TypeScript's defaults.

## Assumptions

- A timed-out task verify's marker keeps the excerpt of its output, as the Rust run does today, where TypeScript's keeps only `Verify command timed out after <n>s`.
- A line's length counts Unicode characters, as the Rust retry feature's `tail_verify_output` does, where TypeScript counts UTF-16 code units; they differ only for characters outside the Basic Multilingual Plane.

## Contract

### Requirement: Run verdict

See `specs/rust-run/spec.md`, "Run verdict", with the new scenario
"Verify output from the config".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-run/spec.md`: MODIFIED "Run verdict", with the new scenario "Verify output from the config".
