---
title: Every change relates to a capability, and creating one is declared
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - traceability
    - watcher-and-harness
---
## Goal

Every change relates to at least one capability, creating a capability is
an explicit declaration, and every capability name osq reads names a real
capability. Lint rejects a change that writes no delta and reads nothing, a
read that names no capability, and a delta that silently creates one. A
proposal declares new capabilities in `creates`. A misspelled name in
`traceability.capabilities` fails config loading with the nearest real
name. Code ownership keeps one reader, `readCapabilityOwnership`, and a
test holds it there.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The relation rules are
tested through `lintChangeFolder` on temporary projects with living specs,
including one run of the pinned OpenSpec validator over a change carrying
`creates:`. Config names are tested through `loadConfig`. The digest is
tested through `buildApprovalDigest`, and the docs by reading the managed
block constant and both `PLANNER.md` copies. Measured before planning in a
scratch worktree: with the rules gated on a project having a living spec,
four existing tests need fixture edits and no other test changes.

## Non-goals

- Groups and other capability metadata. That's `capability-sidecar`.
- Statuses, overrides, or project rule settings.
- Changing the spec or delta format, or how deltas merge.
- Adding relations to archived changes. Archived changes are never linted.
- Relation rules in a project with no living capability spec. The first
  capability of a new project needs no `creates` entry, and the many
  temporary test projects without specs lint as before.
- A new approval digest line. The digest already heads each created
  capability `<name> (new capability):`; `creates` now decides it.

## Surface

- Added: proposal frontmatter `creates`, a list of capability names (frontmatter field)
- Added: lint errors for a change that relates to no capability, a read naming an unknown capability, a delta creating a capability not in `creates`, a `creates` entry that already exists, a `creates` entry with no delta adding a requirement, and a malformed `creates` (lint errors)
- Added: config error for an unknown capability in `traceability.capabilities` (config error)
- Added: `PLANNER.md` managed block bullet on capability relations (document section)

## Decisions

- ADR 001: the capability check runs in `loadConfig` after jiti has loaded the file; no other loader.
- ADR 004: unchanged; the new lint test runs the pinned validator as lint already does.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

There are eight capabilities: cli-foundation, metrics-and-reporting,
spec-lint-and-approve, status-inspection, traceability, version-control,
watcher-and-harness, and web-inspection. The archive holds changes through
100.

`verifyDeltaTargets` in `src/core/spec/linter.ts` lets an ADDED-only delta
create a capability. The approval digest already tells a deliberate
creation from an accident, in "Capability creation": a delta with
`## Purpose` whose name resembles no living capability counts as created,
and anything else raises an `unknown_capability` flag. That stays as the
fallback, so existing digest tests pass; a name listed in `creates` now
counts as created too. Lint is where the rule is enforced.

A first trial applied the rules to every project, and 94 test files
failed, because most temporary test projects hold a proposal with
`reads: []`, no delta, and no living spec. Gated on the project holding at
least one living capability spec, four failed: `focused-verify`
(no relation), and `lint-findings`, `lint-output`, and `manifest` (a delta
for a capability with no living spec). Task 1 owns those four with
`tests.modify: true`. `traceability.capabilities` gets the same gate: three
config tests name `pricing` in projects without specs and pass unchanged.

`parseCodeOwnership` already has one caller, `readCapabilityOwnership` in
`src/core/spec/capability-impact.ts`, which `impact-lint.ts`,
`traceability-lint.ts`, and `report-traceability.ts` use. The brief's
`getCapabilityOwnership()` is therefore `readCapabilityOwnership`, and the
work is a test that keeps it the only caller.

`parseSpecMd` is untouched: `readCreates` in the new relations module reads
`creates` from frontmatter, and the digest and config check import it.
`editDistance` in `src/core/spec/digest-capability.ts` gives the nearest
name.

## Contract

### Requirement: Existing projects without specs lint as before
A project with no living capability spec SHALL lint every change as it did
before this change, apart from the `creates` checks.

#### Scenario: Temporary test projects
- **WHEN** the existing suite runs
- **THEN** only `tests/focused-verify.test.ts`, `tests/lint-findings.test.ts`, `tests/lint-output.test.ts`, and `tests/manifest.test.ts` change, and only in their fixtures

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Capability relations", "Capability creation declaration", and "One code ownership reader"; modifies "Capability creation".
- `specs/cli-foundation/spec.md`: adds "Traceability capability names" and "Capability relation guidance".

Four tasks, and no two share a file. Task 1 adds the lint rules and fixes
the four measured tests, task 2 makes `creates` decide creation in the
digest and guards the ownership reader, task 3 checks
`traceability.capabilities`, and task 4 writes the planner block and
README.
