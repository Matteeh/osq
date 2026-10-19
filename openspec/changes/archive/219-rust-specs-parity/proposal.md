---
title: CI compares the Rust specs kernel with the pinned and latest OpenSpec CLI, and a gate keeps Node out of the Rust runtime
depends_on: ["218"]
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts tests/rust-ci.test.ts
creates:
  - name: rust-linter
    group: rust
features:
  reads:
    - rust-specs
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

ADR 026 moved OpenSpec parsing, validation and the delta merge into the
Rust specs kernel. Its enforcement still needs two parts:

- **Parity with upstream.** CI compares the Rust validator and merge with
  the OpenSpec CLI: validate parity per item and archive parity on the
  differential cases. The pinned CLI runs on each push, and `@latest`
  runs weekly, so drift from upstream shows up as a failed job.
- **No runtime Node.** A lint gate scans every crate's runtime code with
  `syn` and fails on a `Command::new` that spawns `node`, `npx` or
  `openspec`. A fixture crate that spawns `node` proves the gate fires.

The gate is the first code in the linter kernel, which becomes the
`rust-linter` capability. ADR 026's `checks` then names the new tests and
the specs kernel's golden, validation and replay tests.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers the gate's
fixture tests and its corpus test over this repository's crates. The
parity tests need the `parity` feature, so this script does not build
them. Each task that writes one runs it in its own verify, against the
pinned CLI in `node_modules/`. The `check` reruns the decisions and CI
workflow tests at archive and land.

## Non-goals

- Removing the TypeScript code's use of the Node CLI, ADRs 004 and 005,
  or the TypeScript differential test and its weekly workflow. That
  happens when the TypeScript code is deleted.
- Moving the pinned `@fission-ai/openspec` out of `package.json` into a
  dev-only tool folder. The TypeScript code still runs it at runtime.
- Porting OpenSpec's warning that a Purpose under 50 characters is too
  brief, or making Rust as loose as OpenSpec where ADR 026 is stricter.
  The parity test lists those differences.
- Any other lint gate of ADRs 022 to 024.

## Surface

- Added: the `osq-kernel-linter` public items `node_spawns`, `workspace_node_spawns`, `NodeSpawn` and `ScanError`.
- Added: the `parity` Cargo feature of `osq-kernel-specs`, which builds the OpenSpec parity tests.
- Added: the `parity` job of `.github/workflows/rust.yml`.
- Added: `OSQ_OPENSPEC_BIN` is read by the Rust parity tests, as the TypeScript differential test reads it.

## Decisions

- ADR 022: the gate lives in the linter kernel, which depends only on core and its own crates. The parity tests are test targets of the specs kernel, so no crate is added.
- ADR 023: `node_spawns` is a pure leaf over source text, and only `workspace_node_spawns` reads the disk. `syn` and `proc-macro2` join `[workspace.dependencies]`, and no lint is loosened.
- ADR 024: every public function's doc ends with `Implements: rust-linter/<requirement>`, and every test's doc names `Covers: <capability>/<scenario>`. The parity and gate corpus tests have fast counterparts on fixtures.
- ADR 025: the parity tests read today's living specs, archive and fixtures as they are, and write only temporary projects.
- ADR 026: nothing at runtime spawns `openspec`, `node` or `npx`. The Node CLI runs only in parity test targets, which the `parity` feature gates. Validate parity compares pass or fail per item, archive parity ports the differential test, and `checks` names the parity and golden tests.

## Assumptions

- A scratch run on 2026-10-18 compared the Rust validator with pinned OpenSpec 1.13.1 on every archived change. Each change was validated against the living specs that replaying the changes before it gives. All 216 agreed: the 17 changes without a delta fail in both, and every other change passes in both. All 13 living specs pass in both.
- The same run on the validate fixtures found exactly the five differences in "Validate differences". OpenSpec fails `living/valid.md` for its short Purpose. Rust fails three delta fixtures and the `unknown` targets change on rules ADR 026 adds. OpenSpec only reads a change through its `proposal.md`, so the test writes one where a fixture has none.
- Archived changes cannot be validated against today's living specs. OpenSpec then reports a dropped scenario for many old MODIFIED blocks, so validate parity checks each change against the specs as they stood before it landed.
- The weekly `@latest` run goes in `rust.yml`'s existing weekly schedule rather than `openspec-latest.yml`. This keeps the parity job beside the Rust toolchain steps, in a file rust-core owns. `openspec-latest.yml` keeps its TypeScript differential run unchanged.
- The gate reads only string literals in `Command::new` calls, and only in `src/`. A program built at runtime, or a spawn inside a macro body, is not seen. No crate spawns any process today.
- `syn` 2.0.119 and `proc-macro2` 1.0.107 are already in `Cargo.lock` and the local registry cache, so adding them needs no network.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-linter/spec.md`: new capability `rust-linter`. ADDED "Code ownership", "Node spawns", "Workspace Node spawns", "No runtime Node".
- `specs/rust-specs/spec.md`: ADDED "OpenSpec validate parity", "OpenSpec archive parity".
- `specs/rust-core/spec.md`: ADDED "Rust CI parity job". MODIFIED "Rust rebuild decisions" and "Corpus tests".

Shared file: `crates/kernel/specs/Cargo.toml`, which task 2 writes and task 3 extends with its own `[[test]]` entry. The watcher recertifies task 2 when task 3 touches it.
