---
title: The five Rust rebuild ADRs join decisions/, scoped to rust-core, with their checks
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

The Rust rewrite was designed in five ADRs on the Notion Rust Rebuild page:
feature crates and events, code style, link enforcement, the on-disk format,
and OpenSpec in Rust. Change 204 built the core crate under them, but they
are not in `decisions/`, so nothing in osq knows they exist. They could not
land earlier: scoped to `rust-core`, an ADR warns while that capability has
no living spec, and 13 ADR tests require osq's decisions to have no warning.
Since 204 archived, rust-core is living.

This change adds them as ADRs 022 to 026, numbered after TypeScript's 001 to
021, each `applies_to: [rust-core]` so they govern the Rust crates and not
`src/`. Each names a new `tests/rust-adrs.test.ts` in its `checks`, and ADR
022 and ADR 025 also name the 204 tests that enforce them: core does no IO,
and every archived event line round-trips. The ADR files are ready in this
change folder under `adrs/`.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/rust-adrs.test.ts`, the 13 ADR tests that require no
decision warning, and `osq doctor`'s own-decision tests, which fail when an
accepted ADR names a check file that does not exist.

## Non-goals

- Changing any ADR's decision text. The drafts are the Notion ADRs with osq's
  numbers, a scope paragraph, two rules shortened to `limits.maxRuleLength`,
  and their `checks`.
- Marking ADR 004 or ADR 005 superseded. TypeScript osq still calls the Node
  OpenSpec CLI; ADR 026 says they are superseded when the TypeScript code is
  deleted.
- Changing AGENTS.md or CLAUDE.md. None of the five applies to all.
- Any Rust code, or the lint gates the ADRs ask for.

## Surface

- Added: ADRs 022 to 026, `decisions/022-rust-feature-crates.md`, `decisions/023-rust-code-style.md`, `decisions/024-rust-link-enforcement.md`, `decisions/025-rust-on-disk-format.md`, `decisions/026-openspec-in-rust.md` (documents)
- Added: `tests/rust-adrs.test.ts` (the ADRs' check file)

## Decisions

None

## Assumptions

- After this change every later change that writes rust-core must name ADRs 022 to 026 in its `## Decisions`, as osq lint requires for a scoped accepted ADR. Later rust-* capabilities are not covered until a change adds them to `applies_to`.
- Measured on 2026-10-18 in a scratch worktree of main with the five ADRs, their README lines and a placeholder `tests/rust-adrs.test.ts`: the full `pnpm verify` passed, and before that the 135 tests in the ADR and decisions test files passed.

## Human steps

### Before approval

None

### After landing

- Update the Notion Rust Rebuild page: ADRs 001 to 005 are osq's ADRs 022 to 026.

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Code ownership" (`tests/rust-adrs.test.ts`, new scenario "Rust decisions test ownership"); ADDED "Rust rebuild decisions".

No file is shared between tasks.
