# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Landed items are taken out of this file. Each one's text is kept as `brief.md` in its archived change folder, and each finished queue has a summary in Notion under OSQ > Archive. The latest, "osq queue, 2026-10-13 to 2026-10-15 (completed)", covers 189 to 197; earlier queues drove 166 to 188, 156 to 165, 145 to 155, 136 to 144, 132 to 135 and 103 to 131.

This queue serves the Rust rewrite, which is designed by hand in Notion (OSQ > Rust Rebuild, with its roadmap database) and built in this repository. osq's Rust support landed as 201 to 203, rust-core as 204, the mutation gate as 208 and 209, and the storage kernel's read model as 210 to 212. It holds 14 of the 16 `osq query` tables; `requirements` and `task_outcomes` wait for the specs kernel. The item below is a spec fix found while building storage; the brace-scope lint landed as 213.

One change at a time: land each before the next is planned.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [rust-storage-replay-exceptions] The rust-storage Archive replay requirement names the exceptions the replay test uses, 003 to 013

Depends on: nothing

### Goal

The living rust-storage spec says what the replay test checks: changes 003 to 013 are the named exceptions, not 004 to 013.

### Context

As of 2026-10-18:

- The rust-storage requirement "Archive replay" and its scenario "Archived changes replay" say the exceptions are 004 to 013, whose watcher wrote no `done` event.
- Change 210's task 4 found that `003-watcher-and-harness` has no `.run/events/` folder and done markers 1 to 5, so it folds to all pending like 004 to 013. The test in `crates/kernel/storage/tests/archive_corpus.rs` therefore lists 003 to 013, and it passes. The executor said so under `## Deviated` and `## Missing context`.
- Living specs change only through an archived delta.

### Requirements

- A MODIFIED delta of "Archive replay" says 003 to 013, in the requirement text and in the scenario "Archived changes replay", and keeps every scenario it has.
- The change's verify proves the test and the spec agree. No Rust source changes.

### Non-goals

- Any change to the replay test or to storage's reading.
## [rust-specs-parse] The Rust specs kernel parses living specs, delta specs, proposals, task files and tasks.md into typed values, with results equal to TypeScript's parser

Depends on: rust-storage-replay-exceptions

### Goal

Rust osq reads every OpenSpec document osq uses into typed values without Node, as the first step of ADR 026, so storage, validation and the delta merge all build on one parser.

### Context

As of 2026-10-18:

- `crates/kernel/specs` (`osq-kernel-specs`) is an empty skeleton depending only on `osq-core`. No capability owns it yet. Kernel crates may depend on other kernel crates (ADR 022).
- ADR 026 gives the specs kernel OpenSpec parsing, validation and delta merge, and says it parses "living specs, sidecars, proposals, task files and delta specs into core types". Nothing in osq may spawn `openspec`, `node` or `npx` at runtime.
- TypeScript parses in `src/core/spec/delta.ts` (`parseCapabilitySpec`, `parseDelta`, `parseRequirement`, `parseScenario`, `normalizeRequirementName`, `extractPurposeSection`), `src/core/spec/parser.ts` (`parseFrontmatter`, `parseSpecMd`, `parseTaskMd`, `parseTaskList`, `parseCodeOwnership`, `extractSection`) and `src/core/spec/capability-sidecar.ts` (`parseSidecar`).
- The corpus is 12 living specs with 759 requirements and 211 archived changes. Storage already reads a few frontmatter fields itself with `yaml-rust2` (`crates/kernel/storage/src/read/text.rs`).
- Storage's goldens were printed once by TypeScript and committed as fixtures; the Rust tests never run node (210, 211). Tests that read the archive are corpus tests in `tests/*_corpus.rs` (AGENTS.md, Rust crates).

### Requirements

- A `rust-specs` capability in group `rust` owns `crates/kernel/specs/**`.
- The kernel parses a living spec (Purpose, requirements with their text and scenarios, Code ownership sources), a delta spec (ADDED, MODIFIED, REMOVED and RENAMED sections), a sidecar, a proposal's frontmatter and sections, a task file's frontmatter, and a `tasks.md` checklist. A document it cannot read is an error naming the file and line.
- Requirement names normalize as `normalizeRequirementName` does.
- A golden test compares the parse of every living spec and of every archived change's delta specs and task files with JSON printed once by the TypeScript parser and committed as fixtures. The test never runs node or osq.
- Fast tests on the crate's own fixtures cover each document kind, apart from the corpus test.

### Non-goals

- Validation rules and finding codes; that is `rust-specs-validate`.
- Merging deltas or writing specs; that is `rust-specs-merge`.
- Any change to the TypeScript parser.
## [rust-storage-spec-tables] Rust storage fills the requirements and task_outcomes tables from the specs kernel, so it holds all 16 osq query tables

Depends on: rust-specs-parse

### Goal

The Rust read model holds every table TypeScript's `osq query` serves, with rows equal to TypeScript's.

### Context

As of 2026-10-18:

- Storage (210 to 212) holds 14 of the 16 tables. `requirements` and `task_outcomes` were deferred because they need delta spec and task file parsing, which ADR 026 gives the specs kernel.
- TypeScript builds `requirements(change, capability, kind, requirement, renamed_from)` in `src/core/report/query-tables.ts`, one row per delta requirement, a rename keyed on its new name. It builds `task_outcomes` in `src/core/report/task-outcomes.ts` (`deriveTaskOutcomes`, `verifyKind`).
- `osq query` lists each table's columns, and `osq query --json "<select>"` prints its rows.

### Requirements

- Storage builds `requirements` and `task_outcomes` with TypeScript's column names and types, from the specs kernel's parse rather than its own.
- The golden test of storage's rows covers both tables, from rows taken once from TypeScript's `osq query --json` and committed as fixtures.
- The rebuild test still gets the same rows after deleting the database.

### Non-goals

- Any change to the other 14 tables, or to TypeScript's tables.
## [rust-specs-validate] The Rust specs kernel validates specs and changes with ADR 026's strict rules, each finding with a stable code, file, line and fix

Depends on: rust-storage-spec-tables

### Goal

Rust osq checks a change and the living specs with osq's own strict OpenSpec rules, without the Node CLI.

### Context

As of 2026-10-18:

- ADR 026 section 2 lists the rules: a living spec has Purpose and Requirements sections; every requirement holds SHALL or MUST and has at least one `#### Scenario:` with WHEN and THEN bullets; a delta uses only ADDED, MODIFIED, REMOVED and RENAMED, each well formed; no duplicate requirement or scenario names in a capability; a change has at least one delta; MODIFIED, REMOVED and RENAMED name requirements the living spec has.
- TypeScript gets these from `openspec validate --strict --json` through `src/core/spec/linter.ts` and `src/core/spec/openspec-issues.ts`. Every finding blocks (ADR 006).
- ADR 026 Enforcement asks for a golden corpus: all living specs and archived changes validate, and a fixture set of invalid specs gives the expected finding codes.

### Requirements

- The kernel validates a living spec and a change's delta specs against the living specs, with each rule above. Each finding has a stable code, the file and line, and one fix for the human, in the same shape as osq's other lint findings.
- A fixture set holds one invalid document per finding code, and a test checks each gives its code.
- A corpus test validates every living spec with no finding.

### Non-goals

- Validating the merged result; that needs the merge, in `rust-specs-merge`.
- osq's own lint rules outside OpenSpec, such as scope, verify or Decisions checks.
- Wiring the validator into a Rust lint or approve command.
## [rust-specs-merge] The Rust specs kernel applies a change's deltas to the living specs with TypeScript's merge semantics, and the merged result validates

Depends on: rust-specs-validate

### Goal

Rust osq can archive a change's deltas into the living specs without the Node CLI, with the same result TypeScript gets.

### Context

As of 2026-10-18:

- TypeScript merges in `src/core/spec/delta.ts` (`mergeDelta`, `serializeCapabilitySpec`, `DeltaMergeError`) and `src/core/spec/apply-deltas.ts` (`mergeLivingSpec`, `applyOpenSpecDeltas`), and checks the merged result in `src/core/spec/merged-spec-check.ts`.
- ADR 026 section 3 keeps today's semantics, including that living specs are re-derived at sync rather than merged by git, and osq's `<id>-<slug>` archive folders.
- `osq land` rebuilds the living specs from the archive, so applying every archived change's deltas in order should give `openspec/specs/` as it stands.
- `tests/openspec-differential.test.ts` compares osq's merge with `openspec archive` over the cases in `tests/fixtures/openspec-diff/`.

### Requirements

- The kernel merges a change's delta specs into the living specs and serializes them byte for byte as `serializeCapabilitySpec` does. A delta it cannot apply is an error naming the capability and requirement, as `DeltaMergeError` does.
- The merged result is validated with `rust-specs-validate`'s rules, replacing `merged-spec-check.ts`.
- A corpus test replays the archive's deltas in order and gets the living specs byte for byte, or names the changes it cannot replay as a fixed list, as the storage replay test does.
- A test runs the cases in `tests/fixtures/openspec-diff/` and gets the result each case expects for osq.

### Non-goals

- Writing specs to disk, archiving folders or touching git; the archive feature does that later.
- Changing the TypeScript merge.
## [rust-specs-parity] CI compares the Rust specs kernel with the pinned and latest OpenSpec CLI, and a gate keeps Node out of the Rust runtime

Depends on: rust-specs-merge

### Goal

ADR 026's enforcement is in place: drift from upstream OpenSpec shows up in CI, and no Rust crate runs Node at runtime.

### Context

As of 2026-10-18:

- ADR 026 section 4 keeps a pinned `@fission-ai/openspec` as a dev-only CI tool for a validate parity check (pass or fail per item, Rust against `openspec validate --strict --json`) and an archive parity check (the Rust merge against `openspec archive` on living specs), both also run weekly against `@latest`.
- `.github/workflows/openspec-latest.yml` runs `tests/openspec-differential.test.ts` against `@latest` every Monday. `.github/workflows/rust.yml` runs the Rust checks.
- ADR 026 Enforcement asks for a lint gate that fails if any crate outside dev tooling spawns `openspec`, `node` or `npx`, found with `syn` by looking for `Command::new` with those names, and for its `checks` frontmatter to name the parity and golden tests once they exist.

### Requirements

- The validate and archive parity checks run in CI against the pinned CLI and in the weekly job against `@latest`.
- The no-runtime-Node gate runs in `sh scripts/verify-rust.sh`, with a fixture crate that spawns `node` to prove it fails.
- ADR 026's `checks` names the new tests.

### Non-goals

- Removing the TypeScript code's use of the Node CLI, or ADRs 004 and 005; that happens when the TypeScript code is deleted.
