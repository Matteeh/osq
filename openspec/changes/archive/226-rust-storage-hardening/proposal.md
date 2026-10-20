---
title: Storage rebuilds the read model atomically, reads manifest.json into a typed struct, and parses frontmatter only through the specs kernel
depends_on: ["225"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-specs]
---
## Goal

A crash or error halfway through a rebuild should never leave a half-built
read model. Storage should also read each of osq's files one typed way,
not as loose JSON values or through a second YAML reader.

Today `build_read_model` calls `write_read_model`, `apply_labels`,
`insert_manual_edits` and `write_task_outcomes`, and each one opens its
own `Connection` on `db_path`. `write_read_model` removes the old file
first, so a failure between those steps leaves a database with only some
tables filled. `.run/manifest.json` is read as an untyped
`serde_json::Value`, and a malformed one silently reads as absent.
`read/text.rs` splits and parses frontmatter itself with `yaml-rust2`,
next to the specs kernel's `parse_frontmatter`, which does the same split.

After this change, the rebuild writes every table through one connection
and one transaction into `<db_path>.rebuild`. It renames that file over
`db_path` only when every step succeeded. `manifest.json` is read into a
typed `Manifest`, and one that does not read is a `StorageError` naming
the file. Frontmatter goes through `osq_kernel_specs::parse_frontmatter`
only.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test with the corpus tests included.
When osq sets `OSQ_DIFF`, it then runs cargo-mutants on the change's diff.
The golden-row tests and the archive, history, files and specs corpus
tests passing unchanged proves that no table's rows moved. The archive
corpus also proves that every archived manifest reads into the typed
struct.

## Non-goals

- Changing any table's columns or rows.
- Writing `manifest.json`.
- Removing `yaml-rust2` from storage. The exact `cost` read of a `tokens`
  line in `read/snapshot/events.rs` and the YAML value lookups in
  `read/manual.rs` keep it.
- Guarding two rebuilds of the same `db_path` that run at the same time.

## Surface

- Added: `osq_kernel_storage::replace_read_model` (Rust function), which builds a database in `<db_path>.rebuild` and renames it over `db_path`.
- Added: `StorageError::Manifest` (Rust error variant) for a `.run/manifest.json` that does not read.

## Decisions

- ADR 022: the read model stays a cache that can be deleted and rebuilt at any time, and a failed rebuild now leaves the previous cache whole. No crate dependency changes besides `serde` in storage.
- ADR 023: the new code is small named functions. `replace_read_model` is the only one that holds the database's file operations, and the insert functions take a `Transaction`.
- ADR 024: every new or changed public function ends its doc with `Implements: rust-storage/<requirement>`, and every new test names `Covers: rust-storage/<scenario>`.
- ADR 025: `manifest.json` is read as it is on disk, with the fields TypeScript's `ManifestData` writes, and unknown keys are ignored.
- ADR 026: storage splits frontmatter only with the specs kernel's `parse_frontmatter`.

## Assumptions

- On 2026-10-20 all 197 `manifest.json` files under `openspec/changes/` and its archive held only the field types "Manifest file" lists, with `notices.opened` null in many of them. So the stricter read refuses none of them. A wrong-typed field used to read as absent, and now it fails `read_change`.
- `serde` with `derive` is already a workspace dependency, used by `osq-core` and the specs kernel. Adding it to storage changes only storage's entry in `Cargo.lock`, and downloads no new crate.
- `std::fs::rename` replaces an existing file at the destination, so the old database stays whole until the rename. Renaming a file onto a directory fails with an IO error, which keeps `unremovable_stale_path_fails` and `read_model_errors_speak` green.
- Through the specs kernel, frontmatter that is YAML but not a mapping reads as no frontmatter, with the whole text as the body. TypeScript gives the text after it instead. rust-specs "Frontmatter" says no archived document has such frontmatter, and the golden and corpus tests check that for storage.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: ADDED "Manifest file" and "One frontmatter reader"; MODIFIED "Read model rebuild", "Read model tables", "Manifest notices" and "Text fields".

No file is shared between tasks.
