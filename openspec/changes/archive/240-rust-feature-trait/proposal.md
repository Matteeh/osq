---
title: Core holds the Feature trait that ADR 022 says each feature crate exposes, so feature crates can be built in parallel
depends_on: []
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
features:
  reads: [cli-foundation, spec-lint-and-approve]
---
## Goal

ADR 022 says a feature crate exposes one implementation of core's `Feature`
trait and keeps everything else private, but the trait does not exist. Every
feature crate needs it, so it comes first, written once in core, with the
smallest shape the first features (`report` for `osq query`, then `inbox`)
need.

This change adds `osq-core`'s `feature` module: the `Feature` trait with
`name`, `commands` and `run`, and the plain data it names, `Command`,
`Invocation`, `Output` and the typed `FeatureError`. These types are
`#[non_exhaustive]` and built through constructors such as `Command::new`
and `Output::text`, so a later field, like JSON `data` on `Output` or config
on `Invocation`, or a new error variant touches no feature crate. A test in core
implements two features by hand, runs their commands, registers them as
`Box<dyn Feature>` and checks every error's text.

ADR 028, Rust Feature trait, records the shape and what it leaves for later:
server routes, loop hooks, structured output, `Send`/`Sync` bounds and exit
codes each join the trait in the change that first needs them. Its text is
written in this change folder as `adr/028-rust-feature-trait.md`, so the human
reviews the decision itself at approve; task 2 copies it into `decisions/`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with the
corpus tests, and the mutation check on the lines this change touches. The
specs kernel's decisions corpus and the link gates corpus read `decisions/`
and the change's tags, so they prove ADR 028 parses and no tag dangles. The
`check` runs `tests/rust-adrs.test.ts`, which proves ADR 028 is accepted for
group `rust`, names its checks, which exist, and is linked from the index once.

## Non-goals

- Implementing the trait in any feature crate, or wiring the CLI app.
- The lint gate that a feature crate exposes nothing else; it comes with the second feature crate.
- Server routes, loop hooks or structured output in the trait.
- Any change to the TypeScript code.

## Surface

- Added: ADR 028, Rust Feature trait (`decisions/028-rust-feature-trait.md`), and its line in `decisions/README.md`.

## Decisions

- ADR 022: the trait lives in `osq-core`, whose types stay plain data with no IO and no new dependency; a feature's `run` does its IO inside its own crate, and apps hold features as `Box<dyn Feature>`.
- ADR 023: the trait has a test double now and one implementation per feature crate next, so it passes "no trait before a second implementation"; every item has a doc comment.
- ADR 024: public items end with `Implements: rust-core/feature-trait`, `rust-core/feature-constructors` or `rust-core/feature-errors`, tests name `Covers:`, and the new ADR names `tests/rust-adrs.test.ts` and `crates/core/tests/feature.rs` in `checks`. No code carries an `Adr:` tag for it, since the new ADR reaches `decisions/` only in task 2.
- ADR 025: no on-disk format changes.
- ADR 026: no specs kernel code changes; its decisions corpus reads the new ADR.
- ADR 027: the change's scope holds `crates/core`, so it locks core as a whole while it runs.

## Assumptions

- Approving this change accepts ADR 028 as written in `adr/028-rust-feature-trait.md`, including its acceptance line dated 2026-10-21. Edit that file before approving if the trait should read differently.
- The trait is the smallest shape the brief asks for: `run` takes the project `root` as a path and the arguments as raw strings, and returns text. Features parse their own arguments and open the read model from `root`; a typed argument list and JSON output wait for the CLI and server apps.
- `Feature` has no `Send + Sync` supertrait yet; ADR 028 has features open storage per `run` and hold no SQLite connection in the feature struct, so adding the bounds later stays painless.
- 239 (rust-capability-split) writes no file this change writes, so the two can run side by side.

## Contract

### Requirement: Feature trait

See `specs/rust-core/spec.md`.

### Requirement: Feature constructors

See `specs/rust-core/spec.md`.

### Requirement: Feature errors

See `specs/rust-core/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Feature trait", "Feature constructors" and "Feature errors"; MODIFIED "Rust rebuild decisions" (ADR 028 and its row, scenarios kept).

The change folder holds `adr/028-rust-feature-trait.md`, which task 2 copies
byte for byte. No file is shared between tasks.
