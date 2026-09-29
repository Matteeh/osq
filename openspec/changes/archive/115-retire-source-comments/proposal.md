---
title: Only Code ownership carries a source comment
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

Every requirement in the living specs carries a `<!-- source: ... -->`
comment, but only the one on `Code ownership` is read. The rest are unchecked,
and 106 of them name a path that no longer exists. This change's deltas remove
every source comment outside `Code ownership`, and `osq lint` warns when a
new delta adds one.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. At archive, the change-level
`verify` runs with these deltas applied. The living-spec replay test then
checks that each living spec equals the merge of every archived delta plus
this change's, which is the living spec without its 413 comments. A new test
checks the lint warning through `lintChangeFolder`.

## Non-goals

- Checking that `Code ownership` globs match files.
- Changing archive, `mergeDelta`, `parseCodeOwnership`, or the delta or spec
  format.
- Editing archived deltas. Archives are history.
- Changing `PLANNER.md`, `AGENTS.md`, or the templates. `templates/proposal.md`
  and `osq new` already show a source comment only on `Code ownership`.

## Surface

- Added: lint warning `<capability>: requirement "<name>" carries a source comment; only Code ownership keeps one`.

## Decisions

- ADR 001: unchanged; config loading doesn't move, and cli-foundation's delta only drops comments.
- ADR 002: archive merges these deltas with today's `mergeDelta`, without a model and unchanged; the MODIFIED blocks do the sweep.
- ADR 004: unchanged; the validator runs as before, on bigger deltas.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

**How the sweep works.** Each of the 8 deltas holds a MODIFIED requirement
for every living requirement except `Code ownership`, with the exact living
text minus its source comment line. That is 413 requirements and about 9,000
lines. A MODIFIED requirement replaces its whole block, so today's merge
applies them without any code change. The brief records why archive code
doesn't do the sweep.

**How the deltas were made and checked.** On 2026-09-29, a script read each
living spec on main (after 113 landed) with `parseCapabilitySpec` and wrote
each requirement's `raw` without the source comment line. Every source comment
is one line directly under its header. Merging the 8 deltas into the living
specs with `mergeDelta` gave exactly the living specs minus those 413 lines,
leaving one `Code ownership` comment per capability. The spec-lint-and-approve
delta also adds "Source comment warning".

**Measured fallout.** In a scratch worktree of main on 2026-09-29, with the
deltas applied, the change folder holding `.run/archive-specs.json`, and a
rough version of the lint warning: the CLI typecheck passed, and the full test
suite had no failures except `bin-execution`, `package-*`, and `web-export`,
which need a build the scratch copy didn't have. The living-spec replay test
passed. No test lints a delta with a source comment outside `Code ownership`,
so no existing test changes.

**If main moves first.** Since 110, the watcher's sync before archive and
`osq land` stop a change when main changed a requirement it modifies, with
"reject the change and plan it again". That covers all 413 here, so a spec
change landing on main between approval and archive halts this change instead
of being reverted. Approve this change right after planning, approve no other
change that writes specs until it lands, and re-plan with the same script if it
halts.

## Contract

### Requirement: Source comments only on Code ownership
After this change archives, no living spec SHALL carry a source comment
outside `Code ownership`, and every other byte SHALL be unchanged.

#### Scenario: Swept living spec
- **WHEN** this change's deltas are merged into the living specs
- **THEN** each living spec equals its previous text without the source comment lines outside `Code ownership`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: modifies 101 requirements, dropping their source comments.
- `specs/metrics-and-reporting/spec.md`: modifies 38 requirements, dropping their source comments.
- `specs/spec-lint-and-approve/spec.md`: modifies 76 requirements, dropping their source comments, and adds "Source comment warning".
- `specs/status-inspection/spec.md`: modifies 46 requirements, dropping their source comments.
- `specs/traceability/spec.md`: modifies 11 requirements, dropping their source comments.
- `specs/version-control/spec.md`: modifies 8 requirements, dropping their source comments.
- `specs/watcher-and-harness/spec.md`: modifies 110 requirements, dropping their source comments.
- `specs/web-inspection/spec.md`: modifies 23 requirements, dropping their source comments.

One task. No file is shared.
