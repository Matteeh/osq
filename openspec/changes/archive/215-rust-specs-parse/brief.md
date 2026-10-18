---
queue_item: rust-specs-parse
queue_hash: sha256:41b7a97d508535687e2aad7e1ef098c0be239e41b4c816b8e6d4f6049e3eb1e4
planner: null
date: 2026-10-18
---

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
