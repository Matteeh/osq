---
title: Planning attribution after archive and reject
depends_on: ["065"]
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
---
## Goal

One Claude Code session often plans several changes while the watcher archives
the earlier ones. Planning turn attribution keeps its invariant in that flow: no
turn belongs to more than one change, including turns that edited a change that
has since been archived or rejected. The report's planning comparison says
"not reported" when no planning session reported a kind of token, instead of
printing zero.

Change 062 attributes each planning turn by the change folder it edited, as the
path was when the turn happened. `changeFolderForPath` in
`src/core/report/planning-slice.ts` maps an edit under
`openspec/changes/<name>/` to that folder. Segment boundaries come from other
changes' approvals through `resolveChangeApprovalTime` in
`src/core/report/planning-slice-lookup.ts`, which reads that folder's
`.run/plan.jsonl` and `.run/manifest.json`. Once a change is archived, its
folder is `archive/<name>/`, or `archive/<name>-<n>/` after a name collision
(see `src/watcher/archiver.ts`), and once rejected it is `rejected/<name>/`.
The lookup at the old path then finds nothing and the boundary disappears.

Reproduced with `sliceChangeOwnership`: one session edits 063 at 10:00, has
turns without edits at 10:05, 10:10 and 10:20, and edits 064 at 10:30. 063 is
approved at 10:11 and 064 at 10:40. With 063 active, 064 owns 10:20 and 10:30.
With 063 archived before 064's approval, 064 also owns 10:05 and 10:10, which
063 already recorded at its own approval.

The fix lives entirely in the approval lookup. A turn's owner stays the folder
path its edit was recorded under; only the time lookup for that path falls back
to archive and rejected history. `planning-slice.ts` (236 lines) does not
change.

`PlanningComparisonSide` in `src/core/report/planning-economics.ts` holds token
totals as plain numbers and only cost as nullable. On the current archive,
`osq report` prints planning input tokens 0 against execution 15,454,572 while
no planning session reported usage.

Measured in a scratch worktree: making the comparison token fields nullable
passes both typechecks and breaks only the JSON round trip in
`tests/report-planning-economics.test.ts`. `fixture/report/expected.json` is
unaffected because its sessions report tokens. `planning.tokens` stays numeric.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New offline tests drive
`sliceChangeOwnership` with the real `resolveChangeApprovalTime` over real
folders and prove that the 063 and 064 sequence yields the same 064 slice with
063 active, archived, and archived under a collision suffix, with no turn in
both changes; that with 063 rejected at 10:11 instead of approved, 064 owns only
the turns after the rejection; and that a report whose planning sessions
reported no tokens prints "not reported" for every planning comparison token
total, with null in `osq report --json`.

## Non-goals

- Rewriting any archived `plan.jsonl`. Changes approved before this lands keep
  their records.
- Showing planning spent on rejected changes.
- Changing the attribution rule itself.
- Making `planning.tokens` nullable; only `planning.comparison` changes.

## Surface

- Changed: `planning.comparison.planning.input`, `.output`, `.cached`, and
  `.reasoning` in `osq report --json` can be null (JSON field)

## Contract

### Requirement: Moved change approval lookup
Another change's approval time SHALL survive that change's move into archive or
rejected history, and a rejected change without a recorded approval SHALL close
its segment at its rejection time.

#### Scenario: Earlier change archived
- **WHEN** a session's earlier change is archived before a later change is approved
- **THEN** the later change's slice equals the slice it gets with the earlier change active

#### Scenario: Earlier change rejected
- **WHEN** a session's earlier change is rejected instead of approved
- **THEN** the later change owns only turns after the rejection

### Requirement: Planning metrics report
Planning comparison token totals SHALL stay null until a planning session
reports that kind.

#### Scenario: No reported planning tokens
- **WHEN** no planning session reported any tokens
- **THEN** text prints `not reported` for each planning token total and JSON carries null

## Human steps

- Review the proposal, delta specs, and task bodies, then run `osq approve 066`
  yourself.

## Delta

- `specs/metrics-and-reporting/spec.md`: adds "Moved change approval lookup";
  modifies "Planning metrics report".

No file is shared between tasks.
