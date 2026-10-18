---
title: Rust storage fills the requirements and task_outcomes tables from the specs kernel, so it holds all 16 osq query tables
depends_on: ["215"]
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

After 212, the Rust read model holds 14 of the 16 tables TypeScript's
`osq query` serves. The last two need OpenSpec parsing, which ADR 026 gives
the specs kernel, and 215 built it:

- `requirements`: one row per delta requirement of each archived change, a
  rename keyed on its new name, as `insertRequirements` in
  `src/core/report/query-tables.ts` builds it;
- `task_outcomes`: the shape each archived task's plan gave it and what
  happened to it, as `deriveTaskOutcomes` in
  `src/core/report/task-outcomes.ts` builds it.

Storage reads delta specs, task files and the proposal's `verify` through
the specs kernel instead of its own frontmatter reading. `task_outcomes`
also needs two things the specs kernel lacks: osq's scope glob matcher, and
every living spec's Code ownership, from which its `capability` column picks
the capability that owns most of a task's files. This change adds both to
the specs kernel, ported from `scopeCoversPath` and
`readCapabilityOwnership`.

The `capability` column follows the living Code ownership, which changes
whenever a land moves it. So `build_read_model` reads today's ownership,
and the golden test writes `task_outcomes` with the ownership TypeScript
read when it printed the goldens, frozen in `golden/ownership.json`. The
goldens cover every archived change, 001 to 215.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers:

- the scope glob cases and the ownership reader on the specs kernel's
  owners fixture;
- the reading tests and the table test on the spec tables fixture, whose
  expected rows TypeScript printed;
- the corpus test that compares both tables over this repository's archive
  with TypeScript's golden rows.

No test runs `node` or `osq`, and none needs the network.

## Non-goals

- Any change to the other 14 tables, to how storage reads the fields they
  use, or to TypeScript's tables.
- Scope resolution on disk. `scope_covers_path` is the pure predicate; the
  resolver that walks the tree belongs to the run feature.
- Validating or merging deltas, which the next specs kernel changes do.

## Surface

- Added: the `osq-kernel-specs` public items `scope_covers_path`, `CapabilityOwnership`, `read_capability_ownership` and `owner_capabilities`.
- Added: the `osq-kernel-storage` public items `CapabilityDelta`, `TaskOutcomeFacts`, `write_task_outcomes` and `StorageError::Specs`, the `ChangeSnapshot` fields `deltas` and `verify`, and the `TaskFile` fields `plan` and `outcome`.
- Changed: the read model database holds all 16 tables, adding `requirements` and `task_outcomes`, and `build_read_model` reads `openspec/specs/` for Code ownership.

## Decisions

- ADR 022: storage and specs are kernel crates, and a kernel crate may depend on another, so storage depends on `osq-kernel-specs`. Neither touches a feature crate.
- ADR 023: the glob matcher, the owner lookup, the outcome facts and the row mapping are pure leaves. Only `read_capability_ownership`, `read_change`, `write_read_model`, `write_task_outcomes` and `build_read_model` touch the disk.
- ADR 024: every public function's doc ends with `Implements: <capability>/<requirement>`, and every test's doc names `Covers: <capability>/<scenario>`. The golden comparison is a corpus test, and the fixture tests are its fast counterpart.
- ADR 025: storage reads delta specs, task files and event streams as TypeScript writes them, and the database stays a cache that is rebuilt from the files.
- ADR 026: the specs kernel owns parsing delta specs, task files and Code ownership, so storage parses none of them itself, and the scope glob matcher sits beside the ownership it serves.

## Assumptions

- The goldens in `golden/` were printed on 2026-10-18 at `7bd71022`: `requirements.json` and `task_outcomes.json` by TypeScript's `osq query --json`, and `ownership.json` by `readCapabilityOwnership`. They cover every archived change, 001 to 215. `osq query` rewrites only absolute paths, and no row of either table holds one.
- The rows in `fixture-rows/` were printed by the same command on `fixture/spec-tables/`. The glob and owner cases in the rust-specs delta were checked against TypeScript's `scopeCoversPath` and `ownerCapabilities` the same day.
- A task file or proposal whose frontmatter does not parse fails the read, where TypeScript reads it as empty. All 1491 proposals, task files and delta specs in the archive and in storage's fixtures parse with the specs kernel, checked on 2026-10-18.
- `scope_hash_paths` is sorted by bytes, where TypeScript keeps the event's key order. Neither `capability` nor `scope_files` depends on the order.
- The glob matcher goes in the specs kernel, beside Code ownership, rather than in core. The run feature will use it from there for scope audits.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Scope globs", "Capability ownership".
- `specs/rust-storage/spec.md`: ADDED "Delta capabilities", "Task plans", "Task stream outcomes", "Spec table columns"; MODIFIED "Read model tables", "TypeScript row parity".

Shared files: `crates/kernel/storage/src/lib.rs`, which task 2 extends with the reading items and task 3 with `write_task_outcomes`. `crates/kernel/storage/src/read/**`, which task 2 owns, and `crates/kernel/storage/src/model/**`, which task 3 owns; task 4 may correct either where a golden row disagrees. The watcher recertifies tasks 2 and 3 when a later task touches them.
