---
title: The storage read model holds disclosures and manual edits
depends_on: ["211"]
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

After 211, the Rust read model holds 12 of the 16 `osq query` tables. This
change adds two of the three tables TypeScript builds from files other than
event streams, with rows equal to TypeScript's:

- `disclosures`, from the `## Deviated`, `## Missing context` and
  `## Outside scope` sections of each archived task's
  `.run/results/<n>.md`, split by headings as TypeScript's
  `parseResultSections` splits them;
- `manual_edits`, from the records `osq manual` writes under
  `openspec/manual/`.

The third, `task_outcomes`, waits for the specs kernel along with
`requirements`. Its `capability` column is the living capability whose Code
ownership globs cover most of a task's scope files. Computing it needs every
living spec's Code ownership and osq's scope glob matcher, and ADR 026 gives
both to the specs kernel. The column also changes whenever ownership changes,
so a golden copy of it would go stale.

The archive has no manual edit record, so a fixture project under
`tests/fixtures/files/` gives both tables rows. TypeScript's `osq query
--json` printed its expected rows, which are committed next to it.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`
and every workspace test, the corpus tests included, then cargo-mutants on
the change's own diff when osq sets `OSQ_DIFF`. That covers:

- the section cases and the reading tests on the files fixture;
- the table test, whose expected rows TypeScript printed;
- the corpus test that compares `disclosures` over this repository's archive
  with TypeScript's golden rows.

No test runs `node` or `osq`, and none needs the network.

## Non-goals

- `task_outcomes`, which waits for the specs kernel with `requirements`.
  The queue item said this change would add it. The reason it waits is in
  the Goal.
- The `blocked`, `next`, `changed` and `touched` sections as table rows.
  `parse_result_sections` reads them, as TypeScript's parser does, but no
  table holds them.
- The path rewriting `osq query` applies when it prints. No golden
  disclosure row holds a rewritten path today.
- Writing manual edit records, which `osq manual` does in TypeScript.

## Surface

- Added: the `osq-kernel-storage` public items `ResultSections`, `parse_result_sections`, `TaskDisclosure`, `ManualEdit` and `read_manual_edits`, and the `ChangeSnapshot` field `disclosures`.
- Changed: the read model database holds 14 tables, adding `disclosures` and `manual_edits`, and `build_read_model` reads `openspec/manual/`.

## Decisions

- ADR 022: storage stays a kernel crate on `osq-core` only, and reads only files.
- ADR 023: `parse_result_sections`, the record frontmatter reading and the row mapping are pure leaves. Only `read_change`, `read_manual_edits`, `write_read_model` and `build_read_model` touch the disk.
- ADR 024: every public function's doc ends with `Implements: rust-storage/<requirement>`, and every test's doc names `Covers: rust-storage/<scenario>`. The golden comparison is a corpus test, and the fixture tests are its fast counterpart.
- ADR 025: storage reads `.run/results/` and `openspec/manual/` as TypeScript writes them, and the database stays a cache.
- ADR 026: the specs kernel owns parsing living specs and task files. That is why `task_outcomes` waits for it. A result file is not an OpenSpec document, and its heading split is the narrow read the table needs. Manual records are read only as far as their frontmatter fields and body.

## Assumptions

- Deferring `task_outcomes` is a scope change from the queue item. Check that it should wait for the specs kernel rather than have storage read Code ownership itself.
- The 661 rows in `golden/disclosures.json` were printed by TypeScript's `osq query --json` on 2026-10-18 for archived changes 014 to 209. None holds a path that `osq query` rewrote.
- The rows in `fixture-rows/` were printed by the same command on `fixture/files/`. The 13 section cases of "Section cases" were checked against TypeScript's `parseResultSections` on 2026-10-18.
- TypeScript orders manual records with equal `kept_at` by directory order, which is not defined. Rust orders them by file name. The fixture has no tie.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Result sections", "Result disclosures", "Manual edit records", "File table columns"; MODIFIED "Read model tables", "TypeScript row parity".

Shared files: `crates/kernel/storage/src/lib.rs`, which task 1 extends with the reading items and task 2 with nothing new but may touch. `crates/kernel/storage/src/read/**` and `crates/kernel/storage/src/model/**`, which tasks 1 and 2 change and task 3 may correct where a golden row disagrees. The watcher recertifies tasks 1 and 2 when a later task touches them.
