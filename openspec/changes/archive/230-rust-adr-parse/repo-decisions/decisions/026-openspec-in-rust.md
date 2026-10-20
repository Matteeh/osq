---
status: accepted
applies_to: [group:rust]
rule: OpenSpec parsing, validation and delta merge run in Rust in the specs kernel; the Node openspec CLI runs only as a dev and CI parity check, never at runtime.
checks:
  - tests/rust-adrs.test.ts
  - crates/kernel/specs/tests/golden_corpus.rs
  - crates/kernel/specs/tests/validate_corpus.rs
  - crates/kernel/specs/tests/replay_corpus.rs
  - crates/kernel/specs/tests/openspec_validate_parity_corpus.rs
  - crates/kernel/specs/tests/openspec_archive_parity_corpus.rs
  - crates/kernel/linter/tests/node_spawn_corpus.rs
---
# 026. OpenSpec in Rust

Date: 2026-10-17

## Status

Accepted by Mathias on 2026-10-17, numbered 005 on the Notion Rust Rebuild
page. Drafted from the review on the Spec gaps page and the Gaps in the Rust
architecture thread.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not the
TypeScript code under `src/`. For the Rust version it replaces ADR 004, pinned
OpenSpec validator, and ADR 005, OpenSpec validator peer range. Those two stay
accepted for the TypeScript code, which still calls the Node CLI, and are
marked superseded by this ADR in the change that deletes the TypeScript code.

## Context

TypeScript osq calls the Node OpenSpec CLI at runtime for one thing only:
`openspec validate --changes` and `--specs` with
`--strict --json --no-interactive` and `OPENSPEC_TELEMETRY=0`, from
`src/core/spec/linter.ts` and `merged-spec-check.ts`. ADR 004 pinned
`@fission-ai/openspec` to `1.13.1`, and ADR 005 let versions inside
`>=1.13.1 <2` pass with a warning. `osq doctor`, `osq lint` and `osq approve`
all check the installed version.

The delta merge is already osq's own code in `delta.ts` and
`apply-deltas.ts`. `openspec archive` is never run in production. It is only
called by the differential test, which the scheduled `OpenSpec latest`
workflow runs against `@fission-ai/openspec@latest` every Monday.

Keeping the Node CLI at runtime would make every Rust osq install also need
Node, a pinned npm package and a version check, for a set of structural rules.
Those rules are small next to the parser and merge, which have to be ported
anyway.

## Decision

### 1. The specs kernel owns OpenSpec

The specs kernel parses living specs, sidecars, proposals, task files and
delta specs into core types, validates them and applies deltas at archive.
Nothing in osq spawns `openspec`, `node` or `npx` at runtime.

### 2. Validation rules ported to Rust

Validation is always strict, so every finding blocks, as ADR 006 requires. The
rules are the ones osq relies on today:

- A living spec has a Purpose section and a Requirements section.
- Every requirement contains SHALL or MUST.
- Every requirement has at least one `#### Scenario:` with WHEN and THEN
  bullets.
- A delta spec uses only ADDED, MODIFIED, REMOVED and RENAMED sections, each
  well formed.
- No duplicate requirement or scenario names within a capability.
- A change has at least one delta.
- MODIFIED, REMOVED and RENAMED name requirements that exist in the living
  spec.
- The merged result of a change's deltas validates as a living spec, which
  replaces `merged-spec-check.ts`.

Each finding has a stable code, the file and line, and one fix for the human,
in the same shape as other lint findings.

### 3. Delta merge ported as is

The merge keeps today's semantics from `delta.ts` and `apply-deltas.ts`,
including that living specs are re-derived at sync instead of merged by git,
and that archive folders keep osq's `<id>-<slug>` naming rather than
OpenSpec's `<date>-<id>-<slug>`.

### 4. The Node CLI is a parity check only

A pinned `@fission-ai/openspec` stays in a dev-only tool folder for CI. It is
never a runtime or install dependency.

- **Validate parity.** CI runs `openspec validate --strict --json` and the
  Rust validator on the same corpus and compares pass or fail per item.
- **Archive parity.** The differential test keeps comparing the Rust merge
  with `openspec archive` on living specs only.
- **Upstream drift.** The weekly job runs both parity checks against
  `@latest`. A failure means osq and upstream diverge, and following upstream
  is a deliberate change with its own ADR.

### 5. What goes away

The version pin check in `osq doctor`, the peer range and its warning in lint
and approve, the telemetry and interactive flags, and the install hint naming
`pnpm add -D @fission-ai/openspec@1.13.1`.

## Enforcement

- **Rust validator as a blocking gate** in plan lint and approve, and on the
  merged result at archive.
- **Golden corpus.** All living specs and the 191 archived changes must
  validate, and a fixture set of invalid specs must produce the expected
  finding codes.
- **Validate parity job** in CI with the pinned CLI, plus the weekly `@latest`
  run.
- **Archive parity job**, the Rust port of today's differential test.
- **No runtime Node.** A lint gate fails if any crate outside dev tooling
  spawns `openspec`, `node` or `npx`, found with `syn` by looking for
  `Command::new` with those names.
- **ADR link.** `checks` in this ADR's frontmatter names the parity and golden
  tests once they exist, so ADR 024's rule that ADR checks pass before land
  covers them.

## Consequences

- Rust osq installs as one binary with no Node requirement.
- Validation gets the same finding shape as the rest of lint, with codes and
  fixes, instead of translating CLI JSON.
- osq's OpenSpec profile is now defined by osq's own code and tests, with
  upstream compared weekly rather than trusted at runtime.
- Upstream rule changes are no longer picked up automatically. The weekly
  parity job makes them visible, and adopting one is a reviewed change.
- The Node CLI still has to be installed in CI, but only there.

## Rejected

- **Keep calling the Node CLI from Rust.** It keeps a second runtime, a
  version pin and a doctor check, for structural rules that are cheap to
  port.
- **Embed a JS runtime to run upstream's validator.** Heavier than the port
  and still tied to upstream's internals.
- **Drop the parity check.** Without it, drift from upstream OpenSpec would go
  unnoticed, and osq claims to be a strict profile of it.
