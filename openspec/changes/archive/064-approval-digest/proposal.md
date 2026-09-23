---
title: Approval digest
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - watcher-and-harness
    - status-inspection
    - metrics-and-reporting
---
## Goal

`osq approve` shows the approver a short digest of what the change does and
flags the parts that need human judgment. By default the digest never blocks:
flags print last, right above the approval message. `--confirm` makes osq stop
and ask about flagged parts. osq records the flags and whether they were only
shown or confirmed, so `osq report` can later show whether they predict
trouble.

Lint decides whether a change can be approved; nothing points the approver at
the parts that deserve attention. In the archive, 047 (3,533 words) was
approved 1.4 minutes after planning ended and 048 (3,811 words) after 18
seconds, although each Human steps section asked for a full review.

The starting flag set was run over all 62 archived changes, with scopes
resolved by `resolveScope` against today's tree and deltas read by
`parseDelta`. "Trouble" means a `dead` event, or a `regressed` event in a task
or change stream, that is, a dead letter, a regression, or a red archive
verification:

| Flag | Fired | With later trouble |
|---|---|---|
| `shared_file` | 25 | 13 |
| `sensitive_path` | 19 | 10 |
| `verify_without_test` | 3 | 0 |
| `removed_requirement` | 1 | 1 |
| `unknown_capability` | 0 | 0 |

37 changes fire at least one flag and 25 stay quiet. 15 of the 17 changes with
later trouble are flagged: 41% of flagged changes had trouble, against 8% of
quiet ones. Over the first 49 changes, 33 are flagged, matching the brief.
`unknown_capability` cannot fire in hindsight because every capability exists
now. `verify_without_test` predicted nothing so far and stays in to be judged
by the report. `tests.modify: true` and Human steps fire too often to flag and
are shown as information.

The approve command is `approveCommand` in `src/cli/approve.ts` over
`approveSpec` in `src/core/spec/approve.ts`; `buildManifest` in
`src/core/run/manifest.ts` writes the manifest; `osq show` is `showCommand` in
`src/cli/show.ts`. osq already passes `--strict` to the OpenSpec validator, so
the new flag is `--confirm`.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests build digests for
fixture changes that trip each flag and one that trips none, drive
`approveCommand` with and without `--confirm` using an injected terminal check
and answer, read the recorded manifest, render `osq show` for an unapproved
change in text and JSON, and derive the report's flag outcomes from fixture
manifests and events. No test needs a real terminal, a network, or a model.
Existing approve tests keep working unchanged, because the default never
blocks.

## Non-goals

- Making confirmation the default, or a config key for it.
- Blocking approval on flags without `--confirm`. Lint still owns rejection.
- Project-configurable flag rules or sensitive-path lists.
- Judging whether the goal or the plan is good.
- Recomputing flags for changes approved before this change.
- Detecting a verify that names a test file which does not exist.

## Surface

- Added: `osq approve --confirm` (flag)
- Added: `osq show --json` (flag)
- Added: `approvalFlags` in `.run/manifest.json` (`ids`, `mode`: `shown` or `confirmed`)
- Added: `shared_file`, `sensitive_path`, `verify_without_test`, `removed_requirement`, `unknown_capability` (approval flag ids)
- Added: `Approval flags` section in `osq report` and `approvalFlags` in `osq report --json`
- Changed: `osq approve` prints a digest before approving and names the flags on its `Approved` line
- Changed: `osq show` prints the digest for an unapproved change

## Contract

### Requirement: Approval digest
Before writing the approval, `osq approve` SHALL print the goal's first two
sentences, one line per task with its title and resolved-scope file count, the
requirements each delta adds, modifies, and removes, and as information the
`tests.modify` tasks with their existing tests in scope and the Human steps.

#### Scenario: Digest of a clean change
- **WHEN** a change that trips no flag is approved
- **THEN** the digest prints and the approval line carries no flag summary

### Requirement: Approval flags
The digest SHALL flag a file in more than one task's resolved scope, a
sensitive path in a resolved scope, a verify that names no test file or
runner, a delta removing requirements, and a delta for an unknown capability.
Flags SHALL print last, one line each, above an approval line naming them.

#### Scenario: Flags without confirmation
- **WHEN** two flags fire and `--confirm` is absent
- **THEN** approval proceeds and prints `Approved <id> (<folder>) with 2 flags: <label>, <label>`

### Requirement: Approval confirmation
With `--confirm` and flags present, `osq approve` SHALL ask in a terminal,
defaulting to no, and SHALL refuse without a terminal, naming the flags. A
declined or refused approval SHALL write nothing.

#### Scenario: No terminal
- **WHEN** `osq approve <id> --confirm` runs without a terminal and a flag fires
- **THEN** it exits 1 naming the flags, and no approval, manifest, or planning record is written

## Human steps

- Review the proposal, delta specs, and task bodies, then run
  `osq approve 064` yourself.

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Approval digest", "Approval
  flags", and "Approval confirmation"; modifies "Human approval sealing".
- `specs/watcher-and-harness/spec.md`: modifies "Run manifest at approval".
- `specs/status-inspection/spec.md`: modifies "Detailed specification
  inspection".
- `specs/metrics-and-reporting/spec.md`: adds "Approval flag outcomes".

No file is shared between tasks.
