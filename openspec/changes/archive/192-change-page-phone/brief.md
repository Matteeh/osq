---
queue_item: change-page-phone
queue_hash: sha256:84be24d503eec4ac56e7b27de2ab7f9a35973b24edb9ac36278a46e046541142
planner: null
date: 2026-10-14
---

### Goal

On a phone, the dashboard's change view shows one thing first: what this change needs from the human now, with at most one main button. The details are still there, folded below. Every state uses the same layout, so a human learns one page.

### Context

As of 2026-10-13:

- The design is `docs/designs/change-page.html`: seven phone screens at 390 px wide, agreed with the user on 2026-10-13. Open it and follow it. The editable canvas is https://claude.ai/artifact/FoK1oX6knNgVYnJFxnVixv; the file in the repo is the reference executors read. Sample changes and numbers in it are illustrative, and values in [brackets] are placeholders.
- `packages/ui/src/change/ChangeView.tsx` stacks every panel in a fixed order (header, notices, brief, land, review, tasks, digest, actions). Nothing depends on the change's state except whether the review or land panel shows.
- `WebChange` (`src/core/web/web-data-types.ts`) carries no next step. The next-step states exist in `src/core/status/next-step.ts` (unplanned, ready-for-approval, running, blocked, dead, archived, landed), and the inbox uses them.
- The web action verbs are approve, reject, retry and land (`ChangeActionsPanel.tsx`). There is no web verb for planning.
- The approve view (148, 160) already has the notice block, and red notices gate Approve. 160 kept the older desktop layout instead of the phone layout of its mockup.
- 189 (`auto-steer-blocked`) adds a revised-plan-ready state for a dead change and an approve command for it in the inbox and dispatch.
- `plan-handoff-prompt` adds one function that returns the paste-ready block for planning a change.

### Requirements

- The change view puts a status label, the title and one summary line first. Under them is one top block, and then at most one main button, chosen from the change's next step:
  - unplanned: the hand-off block from `plan-handoff-prompt`, and a Copy hand-off button.
  - ready-for-approval: the notice block as today, and Approve. Approve stays locked until every red notice is opened. Plan again is the second button.
  - running: progress (task n of m, how long it has run) and no button. A blocked change says what it waits for.
  - dead: why it stopped (task, failing test or reason, files touched) and a Plan it button.
  - dead with a revised plan ready (189): the outcome and the files the automatic planner changed, and Approve.
  - archived, not landed: one line when every gate passed (a failed gate or an unclean sync shows instead), and a Land button. Plan again is the second button.
  - landed: when it landed and whether it was pushed, the commit, and the tasks. No button.
  - rejected: the reason. No button.
- Plan it and Plan again show the same hand-off block as unplanned, for the change's own id, with a Copy button. The plan-again sheet with notes is a later item.
- Everything else the view shows today stays reachable, folded below the top block: goal, non-goals, surface and decisions; spec changes; tasks with their evidence; digest and history.
- Reject moves to a menu on the page. Retry stays reachable from the task it applies to.
- The page works at 390 px wide with no horizontal scroll. Touch targets are at least 44 px. Desktop keeps working.
- The web change document gains the change's next step, from the same function the inbox uses, so the browser never derives state itself.

### Non-goals

- The plan-again sheet with notes, the new-brief screen, the inbox redesign and settings. Each is a later item.
- Starting a planner from the page. Planning stays a hand-off to the human's own agent (Remote Control from the phone works today).
- Push notifications, a pause-on-usage-limit state, and a "planner is working" signal. osq has none of them yet.
- More than one project.

### Notes for planning

- The design file lives under `docs/`, which is ungoverned. Tasks read it but never edit it.
- Measure the UI tests that pin today's panel order in a scratch worktree before writing task scope.
