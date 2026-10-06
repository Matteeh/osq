---
queue_item: land-view
queue_hash: sha256:baa0808a9d2dc0bb55e2c75087f5881b39e8052f05051ef9eaafef912e68c04b
planner: null
date: 2026-10-06
---

### Goal

An archived change's page in the dashboard shows what a human needs before tapping Land: which gates ran and what they found, a summary of the diff, the living-spec changes, and whether main has moved since archive. This is M2 item 3; with 146's write actions and 148's approve view, the everyday loop can then be run from the browser.

### Context

As of 2026-10-05:

- 146 added loopback write actions (`src/core/web/web-actions.ts`, `web-write.ts`, ADR 009); the change page's `ChangeActionsPanel.tsx` already offers `land` for an archived change.
- 148 added the approve view (`ReviewPanel`, `DeltaReview`, `DigestPanel`, `ApprovalFlags` under `packages/ui/src/change/`). 147 made `osq show`'s change detail one model for the CLI and the browser.
- `osq digest` (130) builds a per-change `DigestChange` (`src/core/report/change-digest.ts`): goal, capabilities with requirements added, modified, removed and renamed, ADRs, and tasks with attempts, deaths and halts.
- Gate evidence is in the events: task and change `verify_ran`, `focused_ran`, `mutation_ran`, `recertification`, the sync's `verify_ran` from `src/core/vcs/sync-verify.ts`, and the proposal's `check:` run since 125. `readLandedAt` (`web-data-lifecycle.ts`) tells landed from archived.
- `osq land` merges main into the worktree when main has moved, rebuilds the living specs, runs verify, and fast-forwards (107, 109).

### Requirements

- An archived change that has not landed shows a land view: each gate that ran at archive and its result and duration; files changed and lines added and removed against the base; the living-spec changes by capability; the executor disclosures (deviated, outside scope); and whether main has moved since archive, so that land will sync and verify again.
- The Land button uses the existing write action, and the view shows the land's result or its halt reason when it returns.
- A landed change shows the same view as a record, without the button.
- The view's data comes from one model in `src/core/`, built from files osq already writes; no new events are needed.

### Non-goals

- A full diff viewer.
- Changing what `osq land` does or adding a gate.

### Notes for planning

- Reuse the digest's per-change entry and 147's change-detail model rather than reading the archive again.
- Say in the proposal whether `osq show <id>` for an archived change prints the same summary; one model, two renderers is the pattern 147 set.
