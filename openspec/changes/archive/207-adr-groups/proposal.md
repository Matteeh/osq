---
title: An ADR can apply to a capability group with applies_to group:<name>
depends_on: []
verify: pnpm verify
features:
  reads:
    - traceability
---
## Goal

An ADR's `applies_to` is `all` or a list of capability names. The Rust
rebuild ADRs 022 to 026 govern every Rust crate, about seventeen
capabilities by ADR 022's plan, but they can name only `rust-core` today. Each
new crate would have to be added to all five ADRs, and it cannot be added
before its change archives: an ADR naming a capability with no living spec
warns, and 13 ADR tests require osq's decisions to have no warning. So a
change that creates a Rust crate is not governed by the ADRs it must follow,
and lint does not ask its proposal to name them.

After this change an `applies_to` entry may be `group:<name>`, which names
every capability whose `osq.yml` sidecar has that group. That is the group
`capabilities.requireGroups` already makes every capability declare. A
capability that an active change creates counts through its sidecar in the
change folder, so the creating change is governed from the start. ADRs 022
to 026 move to `applies_to: [group:rust]`.

`Adr.appliesTo` keeps the entries as written, for display. A new
`Adr.governs` holds the resolved capabilities, and every reader that decides
governance reads it: `governingAdrs`, `systemWideAdrs`, decisions lint,
traceability `@adr` links, the system graph's `applies_to` edges and the ADR
docs page.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/decisions-groups.test.ts` and
`tests/decision-group-readers.test.ts`, the updated
`tests/rust-adrs.test.ts`, and the 13 ADR tests that require no decision
warning.

## Non-goals

- Other selectors such as tags or globs in `applies_to`.
- Groups in `features.reads` or anywhere else a capability is named.
- Changing a capability's group, or the sidecar format.
- Counting an active change's created capability as living anywhere but the
  `group:<name>` resolution. A plain capability name in `applies_to` still
  warns until that capability is living.

## Surface

- Added: `group:<name>` entries in ADR frontmatter `applies_to`
- Added: the decision warning `<path>: applies_to group "<name>" has no living capability`
- Changed: ADRs 022 to 026 `applies_to` from `[rust-core]` to `[group:rust]`, and their scope sentence

## Decisions

- ADR 001: config loading is untouched.
- ADR 002: archive and delta application are untouched.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 013: `osq serve` binding, hosts and writes are untouched.
- ADR 015: `osq mcp` is untouched.
- ADR 018: the steering planner is untouched.
- ADR 019: the tapped planner is untouched.
- ADR 020: the dashboard stays read-only; only the graph document's edges change.
- ADR 021: autopilot is untouched.
- ADR 022: its decision is unchanged; only `applies_to` and the scope sentence move to `[group:rust]`, so it keeps governing rust-core and governs each new Rust crate.
- ADR 023: its decision is unchanged; only `applies_to` and the scope sentence move to `[group:rust]`, so it keeps governing rust-core and governs each new Rust crate.
- ADR 024: its decision is unchanged; only `applies_to` and the scope sentence move to `[group:rust]`, so it keeps governing rust-core and governs each new Rust crate.
- ADR 025: its decision is unchanged; only `applies_to` and the scope sentence move to `[group:rust]`, so it keeps governing rust-core and governs each new Rust crate.
- ADR 026: its decision is unchanged; only `applies_to` and the scope sentence move to `[group:rust]`, so it keeps governing rust-core and governs each new Rust crate.

## Assumptions

- Measured on 2026-10-18 with a prototype in a scratch worktree of main (a new `src/core/foundation/decisions-groups.ts`, `governs` in `decisions.ts`, the group warning in `decisions-validate.ts`, the four readers switched, ADRs 022 to 026 on `[group:rust]`): the full `pnpm verify` passed except the five rows of `tests/rust-adrs.test.ts` that pin `appliesTo` `["rust-core"]`, which task 3 updates. `osq doctor` reported 26 ADRs valid, and a draft change creating `rust-storage` with group `rust` drew `does not name ADR 022, which applies to rust-storage` for each of the five.
- When two active changes give the same new capability different groups, the change folder that sorts first wins; a living sidecar always wins over a change folder's.
- Traceability's `@adr` check and the system graph read `governs`. Their requirements already say an ADR applies when `applies_to` names a capability, and a `group:<name>` entry names its members by the cli-foundation definition, so only the graph requirement gains a scenario.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: MODIFIED "Architecture decision records" (`group:<name>`, `governs`, new scenarios "ADR applying to a group" and "Group ADR governs a change"), "Architecture decision validation" (group warning, new scenario "Group validation").
- `specs/spec-lint-and-approve/spec.md`: MODIFIED "Decisions section lint" (reads `governs`, new scenario "Group ADR governs a created capability").
- `specs/docs/spec.md`: MODIFIED "ADR page model" (`capabilities` from `governs`, new scenario "ADR page of a group ADR").
- `specs/web-inspection/spec.md`: MODIFIED "System graph links" (`applies_to` edges from `governs`, new scenario "Group ADR edges").
- `specs/rust-core/spec.md`: MODIFIED "Rust rebuild decisions" (`[group:rust]`).

No file is shared between tasks. Tasks 2 and 3 read task 1's `governs` without changing `decisions.ts`.
