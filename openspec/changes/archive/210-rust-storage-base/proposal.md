---
title: The storage kernel reads change folders, folds their events and caches changes, tasks and dead attempts in SQLite
depends_on: []
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-verify-script.test.ts tests/rust-agent-guide.test.ts tests/rust-adrs.test.ts
creates:
  - name: rust-storage
    group: rust
features:
  reads:
    - rust-core
---
## Goal

`crates/kernel/storage` is an empty skeleton. Every later Rust crate reads
change state through it: features read only through the storage read model
(ADR 022). This change gives it its first body:

- it lists a project's active, archived and rejected change folders and reads
  one into a typed snapshot, with the rust-core folds over its event files;
- an archived change reads as archived whatever stale `running` or
  `regressed` markers it still holds;
- it builds a SQLite read model, with `rusqlite` and its `bundled` feature,
  holding the first three of the 16 tables TypeScript's `osq query` serves:
  `changes`, `tasks` and `dead_attempts`, with the same columns and rows;
- the live archive is the test corpus: a replay test checks the fold against
  the `done/` markers, and a golden test checks every row of the three tables
  for archived changes 014 to 209 against rows TypeScript printed.

cargo-mutants reruns a crate's tests once per mutant, so a test that reads
the whole archive would run a hundred times or more. The change makes that a
workspace rule in rust-core: a test reading data outside its crate is a
corpus test in `tests/<name>_corpus.rs`, ignored by default and run by
`scripts/verify-rust.sh` with `--include-ignored`, and each requirement it
proves also has a fast fixture test for cargo-mutants to kill mutants with.
rust-core's own `event_corpus` test follows the rule too.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, then cargo-mutants on the change's own diff when
osq sets `OSQ_DIFF`. That covers the leaf, listing and snapshot tests on the
fixture project, the rebuild test of the read model, the archive replay
and golden corpus tests over `openspec/changes/archive/`, and rust-core's
corpus marking check. The `check` runs the TypeScript tests of the verify
script, the agent guide and the ADRs at archive, because the change edits
those files. No test runs `node` or
`osq`, and none needs the network once the crates are fetched.

## Non-goals

- The other 13 tables: `rust-storage-event-tables`, `rust-storage-file-tables`
  and, after the specs kernel, `requirements`.
- Parsing Markdown bodies or delta specs, which is the specs kernel's
  (ADR 026). Storage reads only the frontmatter fields and the `## Goal` text
  its tables need.
- Computing the approval seal, which is its own change after the storage track.
- Worktree and stacked change trees; storage reads the project root's
  `openspec/changes/` only.
- Any writing of markers or events, and any command that serves the tables.
- A typed query API over the tables; the first feature that reads them adds the one it needs.

## Surface

- Added: the `rust-storage` capability and the `osq-kernel-storage` crate's public items `StorageError`, `Location`, `ChangeEntry`, `list_changes`, `TaskFile`, `ChangeSnapshot`, `EventFacts`, `DeadAttempt`, `read_change`, `read_archive`, `frontmatter_string`, `markdown_body`, `goal_section`, `timestamp_ms`, `write_read_model` and `build_read_model`.
- Changed: `scripts/verify-rust.sh` runs `cargo test --workspace -- --include-ignored`, so it runs the corpus tests that cargo-mutants leaves out.
- Added: the corpus test convention, `tests/<name>_corpus.rs` with `#[ignore = "corpus test: <reason>"]`, in AGENTS.md and ADR 024.

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
- ADR 022: storage is a kernel crate on `osq-core` only; it is the read model features read through, and it reads files, never other crates' state.
- ADR 023: small named functions in layers; `frontmatter_string`, `markdown_body`, `goal_section`, `timestamp_ms` and the row mapping are pure leaves, and only `list_changes`, `read_change`, `read_archive`, `write_read_model` and `build_read_model` touch the disk.
- ADR 024: corpus tests leave the mutation loop but never the verify, and every requirement keeps a fast test, so the mutation check stays a blocking gate; the task adds this to the ADR's Mutation check bullet.
- ADR 024: every public function's doc ends with `Implements: rust-storage/<requirement>` and every test's doc names `Covers: rust-storage/<scenario>`, as AGENTS.md says until `#[covers]` exists.
- ADR 025: storage reads today's change folders, `.run` markers and event JSONL as they are, and the SQLite file is a cache that can be deleted at any time.
- ADR 026: storage parses no Markdown body beyond cutting the `## Goal` section and no delta spec; the specs kernel owns that.

## Assumptions

- Rows in `golden/` were printed by TypeScript's `osq query --json` on 2026-10-18 for archived changes 014 to 209: 194 changes, 665 tasks and 50 dead attempts. Archived files do not change, so the rows stay true.
- `tasks.done` comes from the `.run/done/<n>` marker as in TypeScript, not from the fold. The fold agrees with the markers on every task from 014 on; 004 to 013 differ because their watcher wrote no `done` event, and they are the replay test's named exceptions.
- Every `approvedAt` in a manifest and every `archived` timestamp in the archive has the form `YYYY-MM-DDTHH:MM:SS.mmmZ` (355 of 355), so storage reads only that form and needs no date crate.
- `rusqlite` 0.40 with `bundled` and `yaml-rust2` 0.13 build on the watcher's machine with its C compiler; `yaml-rust2` reads YAML 1.2 as the JavaScript `yaml` package does for the frontmatter fields storage needs.
- One archive pass takes about 9 seconds in a debug build; as corpus tests it runs once per verify, not once per mutant. Measured on 2026-10-18 with rust-core's `event_corpus` ignored: cargo-mutants over `osq-core` ran 117 mutants in 44 seconds instead of 4 minutes, with none missed, so the 600-second verify timeout stays.
- The executor fetches `rusqlite`, `yaml-rust2` and their dependencies while it works on task 1, so `Cargo.lock` and the local registry hold them before the watcher's own verify runs.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: MODIFIED "Rust guide for agents".
- `specs/rust-core/spec.md`: ADDED "Corpus tests"; MODIFIED "Verify script mutation step".
- `specs/rust-storage/spec.md`: ADDED "Code ownership", "Change listing", "Change snapshot", "Text fields", "Event file errors", "Archived location wins", "Read model tables", "Read model rebuild", "Archive replay", "TypeScript row parity".

Shared files: `crates/kernel/storage/src/lib.rs`, which task 1 creates and task 2 extends with the read model module; and the reading sources `crates/kernel/storage/src/read/**` and the read model sources `crates/kernel/storage/src/model/**`, which tasks 1 and 2 create and task 4 may correct where a golden row disagrees; and `crates/kernel/storage/tests/fixtures/**`, which task 1 creates and task 4 may add a fixture folder to. The watcher recertifies tasks 1 and 2 when task 4 touches them.
