---
title: AGENTS.md tells an executor how to work in the Rust crates
depends_on: []
verify: pnpm verify
features:
  reads: [rust-core]
---
## Goal

ADRs 022 to 026 govern the Rust crates, but they are scoped to rust-core,
and osq puts only ADRs that apply to all into AGENTS.md's project rules
block. A scoped ADR's rule reaches an executor only through the `## Decisions`
lines of the proposal it runs under. AGENTS.md's Layout does not list
`crates/`, and its Verify section names only `pnpm verify`. An executor
working in a crate learns the layer order, the doc and tag rules and the
verify script only from what each planner repeats, and change 204's task 1
spent three attempts on a cargo it could not find.

After this change AGENTS.md lists `crates/` in its Layout and gains a short
hand-written `## Rust crates` section after Verify. The section points at
the governing ADRs and states the working rules: Rust never touches `src/`,
layers go apps, then features, then kernel, then core, one crate is one
capability, every item has docs, functions and tests carry `Implements:` and
`Covers:` doc tags, tests live in the crate's `tests/` folder, workspace
lints are never loosened, and `sh scripts/verify-rust.sh` runs before exit.
`CLAUDE.md` is a symlink to AGENTS.md and follows it.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/rust-agent-guide.test.ts`, the managed-block and
rules-block tests over AGENTS.md, and the 13 ADR tests that check the rules
block.

## Non-goals

- Putting scoped ADR rules into the executor prompt. That is an osq change to
  the prompt builder, worth its own queue item.
- Changing any managed block of AGENTS.md, the project rules block, or any
  ADR.
- A `#[covers]` attribute. The guide keeps 204's doc-line tags until one
  exists.

## Surface

- Added: AGENTS.md `## Rust crates` section and a `crates/` line in its Layout block (document sections)

## Decisions

- ADR 001: config loading is untouched.
- ADR 004: the OpenSpec validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` is untouched.
- ADR 018: the steering planner is untouched.
- ADR 019: the tapped planner is untouched.
- ADR 021: autopilot is untouched.
- ADR 022, ADR 023 and ADR 024 govern rust-core, not cli-foundation; the guide restates their layer order, doc rule, workspace lints and `Implements:` tag, and gives a `Covers:` doc line in place of ADR 024's `#[covers]` until the attribute exists.

## Assumptions

- Measured on 2026-10-18 in a scratch worktree of main with the section and the Layout line applied: the full `pnpm verify` passed. Nothing pins AGENTS.md text outside its managed blocks.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Rust guide for agents". cli-foundation owns AGENTS.md.

No file is shared between tasks.
