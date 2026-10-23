---
title: Rust land reads its output tail sizes from the config limits
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-harnesses]
---
## Goal

Every limit comes from config. Rust land still holds TypeScript's tail
sizes as constants: the 20-line after-land tail (279), and the 20-line
command tail and 40-line, 400-character verify excerpt from 294. 289 gave
the Rust config the `limits` block they belong to, with
`cardOutputLines`, `markerOutputLines` and `markerLineChars` defaulting to
TypeScript's 20, 40 and 400. This change makes land read all three from
`config.limits`, so a project can tune them in `osq.toml` as it can in
TypeScript, and drops the constants.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that small limits in `osq.toml` shorten the
after-land tail, the sync stop tail and the sync verify excerpt, and that
every earlier land test, which runs on the defaults, still holds.

## Non-goals

- Tail sizes in other crates; the run feature's verify markers are their own item.
- Any change to the default sizes.

## Surface

None

## Decisions

- ADR 022: the change stays in the land feature crate, which already reads the config kernel.
- ADR 023: the tail functions stay pure and take their limits as arguments.
- ADR 024: every public item ends its doc with `Implements: rust-land/<requirement>`, and each new test names `Covers: rust-land/<scenario>`.
- ADR 025: the verify log, the event and the record keep today's format; only their lengths follow the config.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: `LandFeature`'s commands are unchanged.
- ADR 029: the three sizes come from `load_config`'s `limits`, with TypeScript's defaults.

## Assumptions

- TypeScript reads `limits.cardOutputLines` for the after-land tail and the sync command tails, and `limits.markerOutputLines` and `limits.markerLineChars` for the sync verify excerpt, as 289's brief recorded.

## Contract

### Requirement: Land limits

See `specs/rust-land/spec.md`, with "Land after-land command", "Land
sync" and "Land sync verify".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-land/spec.md`: MODIFIED "Land after-land command", "Land sync" and "Land sync verify", each with a new scenario.
