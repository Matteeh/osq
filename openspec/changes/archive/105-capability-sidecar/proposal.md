---
title: Each capability carries a small osq.yml with its group
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

A capability can carry an osq-owned sidecar, `openspec/specs/<capability>/osq.yml`,
holding metadata the OpenSpec format has no place for: a `group` and
optional `tags`. A proposal names a new capability's group in `creates`, a
change may carry a replacement sidecar, and archive writes both. The graph
view groups capability lanes by group, `osq report` counts capabilities with
and without a sidecar, and `osq migrate sidecars` scaffolds them for a
project adopting groups.

Groups are opt-in. By default a bare name in `creates` still works, a
missing sidecar is silent, and only a malformed sidecar is an error. With
`capabilities.requireGroups: true`, lint requires a real group for every
capability a change creates or writes. osq's own config turns it on.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The sidecar reader and
lint are tested through `lintChangeFolder` on temporary projects, with
`requireGroups` off and on. Archive is tested through `archiveSpecFolder` on a
temporary project, the manifest through approval, `osq migrate sidecars`
through `migrateCommand`, the report through `getMetricsReport`, and the
graph through the UI layout and a rendered canvas. Measured before
planning: the pinned OpenSpec validator 1.13.1 passes every living spec
with an `osq.yml` beside it, and a change carrying `specs/<capability>/osq.yml`.

## Non-goals

- Statuses, overrides, ownership in the sidecar, or project rule settings.
- Changing the spec or delta format.
- Zoom levels and other graph views. That's `capability-graph`.
- Lint warnings for a missing or `ungrouped` sidecar while `requireGroups`
  is off. Opt-in features stay silent until a project turns them on.
- Rejecting a bare name in `creates` while `requireGroups` is off. Change
  102 shipped bare names, and they keep working.
- A text section in `osq report`. The counts are in the JSON.

## Surface

- Added: `openspec/specs/<capability>/osq.yml` with keys `group` and `tags`, and a replacement at `openspec/changes/<id>/specs/<capability>/osq.yml` (file)
- Changed: proposal frontmatter `creates` entries may be `{ name, group }` objects as well as names (frontmatter field)
- Added: config key `capabilities.requireGroups`, default `false` (config key)
- Added: `osq migrate sidecars` (command target)
- Added: lint errors for a malformed sidecar, and, with `requireGroups`, a `creates` entry without a group and a written capability without one (lint errors)
- Added: report JSON `coverage.capabilities` with `withSidecar` and `withoutSidecar` (report output)
- Changed: the graph view groups capability lanes under group headers when any capability has a group (UI)

## Decisions

- ADR 001: the new config key loads through jiti with the rest of `osq.config.ts`.
- ADR 002: archive still merges deltas without a model; it then copies sidecars, never merging them.
- ADR 004: unchanged; the validator runs as lint already runs it.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

Capabilities are folders under `openspec/specs/` with no metadata. Change
102 added `creates` as a list of names, read by `readCreates` in
`src/core/spec/capability-relations.ts` and used by the digest and the
traceability config check. This change widens each entry to a name or a
`{ name, group }` object; `readCreates` keeps returning `names`, so those
callers are unchanged, and adds the group per entry.

The user chose opt-in strictness: warnings that fire on every project are
noise, so nothing fires until `capabilities.requireGroups` is on, as
change 079 did for ADR sections. The group `ungrouped` is the placeholder
`osq migrate sidecars` writes; with `requireGroups` on it counts as no
group.

osq runs from this checkout's `dist/` build, loaded when the watcher starts,
so the archiver this change adds does not archive this change. Task 7
therefore writes osq's eight sidecars directly, as a one-time adoption,
with these groups:

| Capability | Group |
|---|---|
| cli-foundation | platform |
| spec-lint-and-approve | planning |
| traceability | planning |
| watcher-and-harness | execution |
| version-control | execution |
| status-inspection | inspection |
| web-inspection | inspection |
| metrics-and-reporting | inspection |

`coverage.capabilities` and the graph's group headers appear only when the
project has a living capability spec, or a capability with a group, so the
report golden `fixture/report/expected.json`, which has no living spec, and
every existing graph test are unchanged. `WebCapabilityNode` gains `group`
as `string | null`.

## Contract

### Requirement: Projects that never opt in see no new findings
A project with no sidecar and `capabilities.requireGroups` unset SHALL lint,
archive, report, and render exactly as before, apart from the manifest's
new sidecar hash entries.

#### Scenario: Existing suites
- **WHEN** the existing suite runs
- **THEN** every test passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Capability sidecar", "Grouped creation", and "Sidecar migration"; modifies "Capability creation declaration".
- `specs/cli-foundation/spec.md`: adds "Capability groups configuration" and "Capability sidecar guidance".
- `specs/watcher-and-harness/spec.md`: adds "Sidecars at archive".
- `specs/metrics-and-reporting/spec.md`: adds "Sidecar coverage".
- `specs/web-inspection/spec.md`: adds "Capability groups in the graph".

Seven tasks, and no two share a file. Task 1 adds the config key, task 2
reads sidecars and `creates` groups and lints them, task 3 writes sidecars
at archive and records their hashes, task 4 adds `osq migrate sidecars`,
task 5 reports coverage, task 6 groups the graph, and task 7 writes osq's
own sidecars, turns `requireGroups` on, and documents it.
