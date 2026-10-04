---
queue_item: change-detail-model
queue_hash: sha256:b1cb9fd01a9c906b87ed0041a801436720110a00d3eab4e16fd0d484b047fa5d
planner: null
date: 2026-10-04
---

### Goal

The data behind `osq show` is a model module separate from its text renderer, and it carries everything an approve view needs, so `osq show` and the dashboard render one model. `osq show` prints byte-identical output. This is refactoring candidate 2 on the Notion roadmap.

### Context

As of 2026-10-04:

- `src/core/status/show.ts` is 1,172 lines, on the line budget's allow list as `core/status/show.ts`, and holds `buildSpecDetails` and `formatSpecDetails` on the function budget's grandfather list.
- It already builds a `SpecDetails` (`getSpecDetails`, `getSpecDetailsFromFolder`) and renders it (`formatSpecDetails`, exported again as `formatShowOutput`). `src/core/web/web-data-change.ts`, `src/cli/show.ts` and `src/cli/inbox-actions.ts` import it.
- `SpecDetails` carries the goal, contract, non-goals, delta, tasks, planning sessions, recertifications, timeline, next step, verification history and after-landing notes. It lacks the proposal's `## Surface`, `## Decisions` and `## Human steps` before approval.
- The approval digest is not in the model: `src/cli/show.ts` computes it from `src/core/spec/digest.ts` and adds it only to `osq show --json`, for an unapproved change.
- The web change document (`WebChange` in `src/core/web/web-data-types.ts`) has the goal, brief, dependencies, reads, writes and tasks, and no proposal sections or digest.

### Requirements

- The model and the text renderer live in separate files, each under the line budget, and `core/status/show.ts` leaves the allow list. Any function this splits leaves the grandfather list or keeps its entry under its new path.
- The model carries the proposal's Surface, Decisions and both Human steps lists, and the approval digest for an unapproved change, computed in core.
- `osq show <id>` and `osq show <id> --json` print byte-identical output for every archived change and the test fixtures.

### Non-goals

- Changing anything `osq show` prints.
- Changing the web change document; `approve-view` does that.
- Refactoring candidates 1 and 3 (the shared change model across planning and inspection).

### Notes for planning

- Prove byte identity against the archive, not only the fixtures: render every archived change before and after.
- Scope the function budget and line budget tests when an entry moves or leaves.
