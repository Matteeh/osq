---
title: The Rust specs kernel parses living specs, delta specs, proposals, task files and tasks.md into typed values, with results equal to TypeScript's parser
depends_on: ["214"]
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-specs
    group: rust
features:
  reads:
    - rust-core
---
## Goal

`crates/kernel/specs` is an empty skeleton. ADR 026 gives it OpenSpec
parsing, validation and the delta merge, so Rust osq never runs Node. This
change is the first step, the parser that storage, validation and the merge
will build on:

- pure leaves read a requirement block, a scenario block with its outcome
  tables, a living spec, a delta spec with its four operations, Code
  ownership sources and Markdown sections, by the rules of TypeScript's
  `delta.ts` and `parser.ts`, written out in the rust-specs delta so the
  executor needs no TypeScript;
- the frontmatter documents follow: proposals, task files, `tasks.md`
  checklists and `osq.yml` sidecars, with a syntax error that names the file
  and line where TypeScript reads such a document as empty;
- readers for each kind name the file in every error;
- goldens printed once by TypeScript, over every delta spec, task file,
  proposal and `tasks.md` of archived changes 001 to 214 and three frozen
  living specs, prove the Rust parse equals TypeScript's.

Living specs change with every land, so the golden freezes copies of three of
them, chosen for their tables, code fences and size, in
`living/`; a corpus test reads the current living specs only to check that
each parses. Long strings in the goldens are FNV-1a hashes, so the five files
hold 2.2 MB rather than 5.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with `-D warnings`,
every workspace test with the corpus tests included, then cargo-mutants on
the change's diff when osq sets `OSQ_DIFF`. That covers the fast parsing and
reading tests of tasks 1 and 2, the frozen living specs against their golden,
the archive golden over 001 to 214 and the parse of every current living spec.
No test runs `node` or `osq`, and none needs the network.

## Non-goals

- Validation rules and finding codes; that is `rust-specs-validate`.
- Merging deltas or writing specs; that is `rust-specs-merge`.
- Storage's `requirements` and `task_outcomes` tables, and moving storage's
  own frontmatter reading onto this crate; that is `rust-storage-spec-tables`.
- Brief files, ADR files and `openspec/queue.md`; the first feature that
  reads them adds their parse.
- Any change to the TypeScript parser.

## Surface

- Added: the `rust-specs` capability and the `osq-kernel-specs` crate's public items `normalize_requirement_name`, `parse_requirement`, `parse_scenario`, `parse_living_spec`, `code_ownership`, `parse_delta`, `section`, `parse_frontmatter`, `parse_proposal`, `parse_task_file`, `parse_task_list`, `parse_sidecar`, the six `read_*` functions, their value types and `SpecsError`.

## Decisions

- ADR 022: specs is a kernel crate on `osq-core` only; it depends on no other kernel crate, so storage can later depend on it.
- ADR 023: every parser is a pure leaf over text; only the six `read_*` functions touch the disk. Every file stays under 250 lines and every function under 80.
- ADR 024: every public function's doc ends with `Implements: rust-specs/<requirement>` and every test's doc names `Covers: rust-specs/<scenario>`; the archive golden is a corpus test with a fast counterpart on the frozen living specs.
- ADR 025: the parser reads today's living specs, sidecars, proposals, task files and `tasks.md` as they are, CRLF files included.
- ADR 026: the specs kernel owns OpenSpec parsing; nothing in it spawns `openspec`, `node` or `npx`, and a document it cannot read is an error naming the file and line.

## Assumptions

- ADR 026 says the kernel parses "into core types". The value types live in `osq-kernel-specs` for now, as storage's snapshot types live in storage, since no core item uses them yet; ADR 024's link graph moves the ones it needs into `osq-core`.
- The goldens in `golden/` were printed by TypeScript's `parseDelta`, `parseTaskMd`, `parseSpecMd`, `parseTaskList`, `parseCapabilitySpec`, `parseCodeOwnership` and `parseSidecar` on 2026-10-18, over 492 delta specs, 729 task files, 212 proposals and 212 `tasks.md` of archived changes 001 to 214, and over the copies in `living/`. Archived files do not change, so they stay true. TypeScript read every archived frontmatter as a YAML mapping, so the stricter syntax error breaks no archived document.
- 42 archived files from 001 to 028 use CRLF line endings; the goldens cover them.
- `yaml-rust2` 0.13, already a workspace dependency, reads every archived frontmatter as the JavaScript `yaml` package does for the fields parsed here, and its error marker's line is the YAML's 1-based line, checked on 2026-10-18.
- The verify ran in about 100 seconds for each storage change, so the mutation step over this crate's new code fits the 600-second verify timeout.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-specs/spec.md`: ADDED "Code ownership", "JavaScript text rules", "Requirement names", "Requirement blocks", "Scenario blocks", "Living specs", "Code ownership sources", "Delta specs", "Markdown sections", "Frontmatter", "Frontmatter values", "Proposals", "Task files", "Task lists", "Sidecars", "File readers", "TypeScript parse parity".

Shared files: `crates/kernel/specs/src/lib.rs`, which task 1 creates and task 2 extends with the document and reading modules; the Markdown sources `crates/kernel/specs/src/markdown/**`, which task 1 creates, and the document and reading sources `crates/kernel/specs/src/document/**` and `crates/kernel/specs/src/read/**`, which task 2 creates; task 3 may correct any of them where a golden entry disagrees, and the watcher recertifies tasks 1 and 2 then. Task 3 does not edit `lib.rs`.
