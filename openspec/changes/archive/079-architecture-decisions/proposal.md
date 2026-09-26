---
title: Architecture decisions reach every spec
depends_on:
  - "078"
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
    - status-inspection
    - metrics-and-reporting
---
## Goal

Architecture decisions in `decisions/` shape every spec that should follow
them, in short rules a cheap executor can't misread. An ADR says in its
frontmatter what it applies to, named capabilities or the whole system, and
states its rule in one line. System-wide rules appear in a block of AGENTS.md
that `osq init` generates, so every agent reads them on every task. The planner
sees every accepted ADR in the plan prompt and turns the ones governing the
capabilities it writes into one-line rules in the proposal's `## Decisions`
section, which lint checks. The approval digest lists the governing decisions
and flags each departure, and the watcher warns when the instructions an agent
will follow changed after approval. Covers roadmap stage 2.8a.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects and fixture changes prove that:

- a project with two accepted system-wide ADRs gets a rules block with both
  lines in number order after `osq init`, and a second run changes nothing
- a superseded ADR's line disappears on the next `osq init`, and its
  replacement's line appears
- a stale block fails `osq doctor` and `osq lint`, and passes after `osq init`
- more rules than `limits.maxProjectRules` fail with a message naming the limit
- an ADR file without frontmatter is ignored and listed as a doctor warning
- the plan prompt lists every accepted ADR with its scope and rule, and no
  proposed or superseded ones
- a change writing a capability governed by an accepted ADR fails lint when the
  Decisions section doesn't name it, and passes when it does
- `None` passes when nothing governs the change, a missing section fails in a
  project with ADRs, and a project without ADRs needs no section
- a `Departs from ADR 007:` line raises one `adr_departure` flag, which
  `osq report` counts
- editing AGENTS.md between approval and the first attempt appends
  `instructions_changed`, prints a warning, and still runs the task
- accepting a new ADR for a written capability after approval does the same
- osq's own four ADRs parse, and their doctor check passes

## Non-goals

- Checks that enforce an ADR mechanically, such as named check tests or denied
  dependencies. That is stage 2.8b.
- Judging whether code complies with a decision. The Decisions section proves
  the planner considered each decision; the reviewer judges the rest.
- Putting ADR text into executor prompts. Executors get the rules block and the
  spec.
- Blocking a task when instructions changed after approval.
- Turning the handwritten Principles in osq's AGENTS.md into ADRs.
- Requiring a Decisions section in projects that have no ADR with osq
  frontmatter.

## Surface

- Added: ADR frontmatter fields `status`, `applies_to`, `rule`, and
  `superseded_by` (frontmatter fields)
- Added: AGENTS.md markers `<!-- OSQ:RULES:START -->` and
  `<!-- OSQ:RULES:END -->` around a `## Project rules` block (document section)
- Added: the proposal's `## Decisions` section, required by `osq lint` and
  `osq approve` in projects with ADRs (document section)
- Added: the plan prompt's `## Architecture Decisions` section (document
  section)
- Added: `limits.maxRuleLength` and `limits.maxProjectRules` (config keys)
- Added: the `adr_departure` approval flag, and a `Decisions:` list in the
  approval digest (approval output)
- Added: the `instructions_changed` event, its watcher warning line, and its
  `osq show` line (event type)
- Added: the `decisions` field of an approval's `.run/manifest.json` (manifest
  field)
- Added: the `decisions` check in `osq doctor` (doctor check)

## Decisions

- ADR 001: the two new limits load through the existing jiti config loader;
  nothing new loads TypeScript.
- ADR 002: archive keeps merging this change's deltas without a model; the
  drift check only reads files.
- ADR 004: the Decisions lint adds no validator call; lint keeps running the
  local validator with its fixed flags.
- ADR 005: no version check moves; the validator gate is unchanged.

## Background

osq's ADRs are 001, 002, 004 and 005 in `decisions/`: plain markdown with a
`Date:` line and a `## Status` section, and no frontmatter. `paths.decisions`
exists in `src/core/foundation/config.ts` with the default `decisions`, and
nothing reads it. `parseFrontmatter` in `src/core/spec/parser.ts` parses YAML
frontmatter. `readLivingCapabilityNames` in `src/core/spec/digest-capability.ts`
lists living capabilities.

osq manages one block in AGENTS.md between `<!-- OSQ:START -->` and
`<!-- OSQ:END -->`, written by `writeManagedBlock` in
`src/core/foundation/init-managed.ts` and checked by
`src/core/foundation/doctor-managed.ts`. The rules block is a second, separate
marker pair; the old markers are not substrings of the new ones.
`tests/doctor.test.ts` pins the list of doctor checks, so the new `decisions`
check appears only when the project has ADR files or a rules block, as
`planning-prices` appears only when it has something to say.

`buildBaseOpeningPrompt` in `src/cli/plan-queue.ts` is 247 lines against the
250-line budget, so the new section and the existing capability spec list move
into a new module. `buildManifest` in `src/core/run/manifest.ts` already
records the AGENTS.md hash at approval, and nothing compares it afterwards.
`src/watcher/runner.ts` is 199 lines against the strict under-200 budget in
`tests/import-graph.test.ts`, so the drift check hooks into `spawnTaskAgent` in
`src/watcher/spawn.ts`, 193 lines, where the attempt number is already known.

A rough version of this change in a scratch worktree broke 18 test files that
write proposals inline when `## Decisions` was required everywhere. Requiring
it only in projects with at least one ADR carrying osq frontmatter broke none
of them. The remaining fallout was `tests/golden-events.test.ts` from the
longer proposal template, and `tests/report-approval-flags.test.ts`,
`tests/report-json.test.ts` and `fixture/report/expected.json` from the new
flag id. Every other suite, including `tests/adr-004.test.ts` with frontmatter
added to ADR 004, passed.

## Contract

### Requirement: Decisions section lint
In a project whose decisions folder holds at least one ADR with osq
frontmatter, `osq lint` and `osq approve` SHALL reject a proposal whose
`## Decisions` section is missing or empty, or that doesn't name an accepted
ADR governing a capability the change writes.

#### Scenario: Governing ADR not named
- **WHEN** accepted ADR 009 applies to `ingress`, a change has a delta for `ingress`, and its Decisions section says `None`
- **THEN** lint fails naming ADR 009 and `ingress`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Architecture decision records",
  "Architecture decision validation", "Project rules block", "Decisions
  doctor check", "Plan prompt architecture decisions", "Planner decisions
  guidance", "Decision limits", and "osq's own decision records"; modifies
  "One proposal format".
- `specs/spec-lint-and-approve/spec.md`: adds "Decisions section lint",
  "Project rules lint", "Approval digest decisions", and "ADR departure flag".
- `specs/metrics-and-reporting/spec.md`: adds "ADR departure flag outcomes".
- `specs/watcher-and-harness/spec.md`: adds "Governing decisions in the
  manifest" and "Instructions changed after approval".
- `specs/status-inspection/spec.md`: adds "Instructions changed in show".

Seven tasks; no file is shared. Task 1 owns
`src/core/foundation/decisions.ts`, which every later task imports. Task 2 owns
`src/core/foundation/rules-block.ts`, which task 5 imports. Task 4 owns the
templates and the managed planner block, and task 6 owns
`src/core/report/approval-flags.ts` and the report fixture.
