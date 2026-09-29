---
queue_item: retire-source-comments
queue_hash: sha256:02c6194ab09e025440eafeb4752de73b8a345960c56cb42ab1835bfd0e18394e
planner: null
date: 2026-09-29
---

### Goal

The `<!-- source: ... -->` comment is removed from every requirement in the living specs except `Code ownership`, and planners stop writing new ones. Nothing reads these comments and nothing checks them, so a planner or an agent that trusts one can be sent to a file that has moved.

### Context

As of 2026-09-28:

- All 428 requirements across the 8 living specs carry a source comment. Only the 8 on `Code ownership` requirements are read: `parseCodeOwnership` in `src/core/spec/parser.ts` reads their globs as the capability's owned files.
- 106 of the other comments name at least one path that matches no file, 159 of 1,534 entries in all. For example, web-inspection's comments still name `src/core/web-data*.ts` and `src/core/report.ts`.
- Planners still add them to new deltas: every archived change from 100 to 106 does. No template asks for them. `templates/proposal.md` shows one only on `Code ownership`. Planners copy the habit from the living specs.
- Living specs change only when the watcher archives a change and applies its deltas. `tests/living-specs-delta-equivalence.test.ts` checks that each living spec equals the deterministic merge of every archived delta, replayed with `mergeDelta` from `src/core/spec/delta.ts`. The test already normalizes one past merge change, with `stripLegacyDeltaReferences`.
- The scenario index gives checked links from scenarios to tests and functions (change 081), so a loose "source" hint per requirement adds nothing for traceability.

### Requirements

- The change's own deltas remove the comments. For every living capability, the delta holds a MODIFIED requirement for each requirement except `Code ownership`, with exactly the living text minus its source comment line.
- After this change archives, no living spec in this repository has a source comment outside `Code ownership`, and every other byte is unchanged.
- `osq lint` warns, and never fails, when a delta requirement other than `Code ownership` carries a source comment. The warning says only `Code ownership` keeps one.
- Archive and `mergeDelta` don't change. They keep applying approved text exactly (ADR 002).
- `parseCodeOwnership` and its fallback to backtick paths don't change.
- The delta-equivalence test passes unchanged, because replaying every archived delta ends at the swept living specs.

### Decision

Decided on 2026-09-28: the change's own MODIFIED deltas do the sweep, and a lint warning stops new comments.

- The watcher that archives a change runs the osq build from the main checkout, not the change's branch. So stripping comments in archive code could not take effect at this change's own archive. MODIFIED deltas work on today's merge, because a MODIFIED requirement replaces its whole block. On 2026-09-28, generated MODIFIED deltas for all 8 capabilities merged with today's `mergeDelta` into exactly each living spec minus its comment lines, leaving the 8 `Code ownership` comments.
- Costs accepted: the deltas are large (about 8,900 generated lines), and a MODIFIED requirement puts back its whole block as it was at plan time. If another change edits one of those requirements between planning and archive, this change reverts that edit.

Alternatives considered:

- Archive strips comments, and a second change sweeps after the first lands and the watcher restarts. Rejected: two changes, the equivalence test has to ignore comments in between, and archive would alter approved text.
- Archive strips comments from each capability it rewrites, with no sweep. Rejected: specs no change touches keep stale comments indefinitely, the equivalence test has to ignore them permanently, and archive would alter approved text.
- Keep the comments and check them. Rejected: the repair costs the same big deltas, and every later file move then needs a spec edit.
- Lint warning only. Rejected: the 106 stale comments stay.
- Edit living specs by hand. Rejected: living specs change only at archive, and replaying the archive brings the comments back.

### Non-goals

- Checking that `Code ownership` globs match files.
- Changing archive, the merge, or the delta or spec format.
- Editing archived deltas. Archives are history.

### Notes for planning

- Generate the deltas with a script, from `parseCapabilitySpec` in `src/core/spec/delta.ts`: each requirement's `raw` without its source comment line. Before finishing, merge them into the living specs with `mergeDelta`, and check the result equals each living spec minus the non-ownership comment lines.
- The new lint requirement goes in the spec-lint-and-approve delta beside that capability's sweep, with no source comment of its own.
- Plan this change right before approving it, with no other approved change that writes specs waiting, and land it before approving the next. Re-generate the deltas if any living spec changed since planning.
- One task: the lint warning and its tests. Measure in a scratch worktree for tests that pin lint warning counts.
- The warning is lint's only new rule. Keep it a warning so that an old habit never costs a retry.
