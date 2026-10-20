---
status: accepted
applies_to: [group:rust]
rule: ADRs, capabilities, requirements, code and tests form one link graph in core; every link is tagged in the files, and a missing or broken link blocks the change.
checks:
  - tests/rust-adrs.test.ts
---
# 024. Rust link enforcement, one graph of ADRs, capabilities, requirements, code and tests

Date: 2026-10-17

## Status

Accepted by Mathias on 2026-10-17, numbered 003 on the Notion Rust Rebuild
page. Drafted from Mathias's requirement of 2026-10-17 to enforce ADRs and
capabilities and link them to each other and to specs, and from the review on
the Spec gaps page.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not the
TypeScript code under `src/`, which keeps its own ADRs until it is deleted.

## Context

The TypeScript version of osq already links a lot. A change must name every
ADR that governs a capability it writes, ADR rules are copied into
`AGENTS.md`, ADR `checks` and `denies` tie a decision to code, and
traceability tags link requirements, tests and code. But most link checks only
warn, 8 of the 18 ADRs have nothing that enforces them in code, a departure
from an ADR raises only a red notice, a living requirement forgets which ADRs
govern it, unowned code is caught only in osq's own repo, and traceability is
TypeScript-only and on trial.

ADR 006 says a gate blocks or it goes, and a warning lives only while it is
measured. Starting the Rust version with every crate tagged from day one is
much cheaper than adding tags later. Rust makes the code side easy: the `syn`
crate parses source exactly, so tags can be read without guessing.

## Decision

### 1. Tags in the files

- **Tests name the scenario they prove** with an attribute:
  `#[covers("land/rejects-dirty-tree")]`. The id is `<capability>/<scenario>`.
- **Public functions name the requirement they implement** in a doc tag:
  `/// Implements: land/rejects-dirty-tree`. They may also name the ADRs they
  follow: `/// Adr: 022`.
- **ADR frontmatter** keeps `status`, `applies_to`, `rule`, `superseded_by`,
  `checks` and `denies`, and adds `enforced_by` for an ADR that a structural
  rule or the validator agent enforces.
- **Capability ownership** moves from an HTML comment in the spec into the
  typed `osq.yml` sidecar. ADR 022 makes most of it a path:
  `openspec/specs/land/spec.md` owns `crates/features/land/**`.

### 2. One link graph in core

Nodes are ADRs, capabilities, requirements, scenarios, files, functions, tests
and changes. Edges are `applies_to`, `governs`, `owns`, `implements`,
`covers`, `reads`, `writes`, `supersedes` and `departs`. Core holds the graph
types and the rule trait. The specs kernel parses ADRs, specs and sidecars,
and the linter kernel reads tags from code with `syn`. The graph is built from
files, so it can be rebuilt at any time, and the storage read model caches it
as the `links` view.

Every link rule is a query over this graph. The server's graph endpoint
returns the same graph with its gaps, and the metaloop reads it too, so lint,
the UI and the metaloop can't disagree.

### 3. Rules, each measuring or blocking

| Rule | State |
| --- | --- |
| Every governed file is owned by exactly one capability | blocking |
| Every capability has a spec with a Purpose and at least one requirement, and owns at least one file | blocking |
| No broken references: `applies_to`, `features.reads`, `superseded_by`, `Implements:`, `Adr:` and `#[covers]` point at things that exist and are live | blocking |
| A change that writes a capability names every ADR that governs it | blocking |
| Every scenario a change adds or modifies is covered by a test that names it | blocking |
| Every public function has an `Implements:` tag | blocking |
| A covering test actually executes the function that implements the requirement, checked with `cargo llvm-cov` | measuring, then blocking |
| Every accepted ADR has an enforcement: `checks`, `denies`, a structural rule such as a crate dependency or lint, or `enforced_by: validator` | blocking for new ADRs, measuring for older ones |
| Every accepted ADR's checks run and pass before land | blocking |
| A departure adds an ADR that supersedes the one it departs from | blocking |
| A scoped file owned by a capability with no delta in the change | measuring, then blocking |

A measuring rule has a window and block-or-drop criteria. When the window
ends, the rule becomes blocking or is removed.

### 4. Archive records the governing ADRs

When a change archives, osq writes which ADRs governed each requirement it
added or modified, taken from the proposal's `## Decisions`, into the
capability's sidecar. A living requirement then carries its decisions, and the
ADR page in the UI can list them.

## Enforcement

- **Link graph builder** in the specs and linter kernels, with `syn` for code
  tags and the sidecar for ownership.
- **Link gates** in the linter, one per rule in section 3, each with its
  state. They run at plan lint, pre-spawn, archive and land with the change,
  the base commit and the graph as explicit inputs.
- **Coverage check.** At archive, run the change's covering tests under
  `cargo llvm-cov` and check that each one executes the function that names
  its scenario.
- **Mutation check.** `cargo llvm-cov` proves a test runs the code, and
  `cargo mutants` proves the test checks it. `scripts/mutants-rust.sh` runs
  cargo-mutants the same way locally and in Rust CI, which checks the diff of
  each push and pull request and the whole workspace weekly. rust-core has
  zero missed mutants, so the CI check blocks. Next it becomes part of osq's
  verify for Rust changes, so agents fix misses inside the task. Each crate
  follows the same path as it is built. Corpus tests in `tests/*_corpus.rs`
  are ignored under cargo-mutants and run by `scripts/verify-rust.sh`, so the
  mutation check reruns only fast tests and every requirement keeps a fast
  test to kill mutants with.
- **ADR checks before land.** The land feature refuses unless every accepted
  ADR's `checks` ran and passed on the land tree.
- **Departure gate.** Approve refuses a `Departs from ADR <n>` line unless the
  change also adds an ADR with `supersedes: <n>`.
- **Archive writer.** The archive feature records governing ADRs per
  requirement in the sidecar.
- **Graph view.** The server returns the graph and its gaps, and the UI shows
  unowned files, uncovered scenarios and unenforced ADRs.

## Consequences

- Every crate is born tagged, so traceability costs a line per function and
  test instead of a later migration.
- Renames are caught: a capability rename that leaves a stale `applies_to` or
  tag fails lint.
- An ADR can no longer be accepted and then ignored, since it needs an
  enforcement and its checks gate land.
- Executors must write tags. The executor prompt says so, and the gates reject
  a task that forgets.
- Tags tie tests to requirements rather than to functions, so a refactor that
  moves code doesn't break links.
- Other languages need their own tag readers behind the languages adapter of
  ADR 017. Until a reader exists, the gate says which languages it can't read.

## Rejected

- **Linking tests to functions.** Function and test pairs break on every
  refactor, while a requirement stays put.
- **Warnings for missing links.** Under ADR 006 a warning without a
  measurement window is noise, and the TypeScript version showed links drift
  when they only warn.
- **A separate traceability tool.** One graph in core keeps lint, the UI and
  the metaloop on the same data.
- **Tags as comments only, without a coverage check.** A pasted tag would
  pass. Coverage makes the test prove it runs the code.
