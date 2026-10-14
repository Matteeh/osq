---
title: One phone Change page whose top block and main button follow the change's state
depends_on: ["190"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
---
## Goal

On a phone, the dashboard's change view first shows what the change needs
from the human now, with at most one main button. The details are still
there, folded below. Every state uses the same layout, so a human learns one
page. The design is `docs/designs/change-page.html`.

The server adds the change's next step, the plan paste block and the
automatic planner's record to the change document. The browser picks the
page from them and works nothing out itself.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/web-change-next.test.ts` proves the document fields,
`tests/ui-page-model.test.tsx` the page per state,
`tests/ui-change-page.test.tsx` the layout and the hand-off, and
`tests/ui-actions-page.test.tsx` where the actions sit.

## Non-goals

- The plan-again sheet with notes, the new-brief screen, the inbox redesign
  and settings.
- Starting a planner from the page. Planning stays a hand-off to the human's
  own agent.
- Push notifications, a pause-on-usage-limit state, and a "planner is
  working" signal.
- More than one project.
- Land time, the land commit and whether it was pushed on the landed page.
  osq does not record them in the change's files today.
- The failing test's output on the halted page. The web document carries the
  task's reason and result, not its verify log.

## Surface

- Added: `nextStep`, `planHandoff` and `autoSteer` fields on the web change document (`GET /api/changes/<id>` and the static export's `data.js`).
- Changed: the dashboard's change view layout: a status label, title and summary, one top block, folds for the details, and a button bar with at most one main button.
- Added: dashboard buttons `Plan it`, `Plan again`, `Plan it myself` and `Copy hand-off`, and the `More actions` menu that now holds Reject, Retry change and manual commands.
- Changed: `Retry task <n>` moves into that task's row of the task table.

## Decisions

- ADR 013: the page adds no write. Copy and the plan buttons stay in the browser, and Approve, Land, Reject and Retry go through the existing actions endpoint unchanged.

## Assumptions

- The Approve and Land buttons keep the labels `Approve` and `Land`, not `Approve 190` as the design shows. The title above already names the change, and existing tests pin the labels.
- Plan it, Plan again and Plan it myself copy the paste block 190 gives. The `plan-prompt.md` it names exists only after `osq plan <id>` writes it, so the page says so when the file is missing. `osq plan <id>` rebuilds the prompt for an unplanned or steering change. For an archived change with nothing to steer it does not, so Plan again there needs the later plan-again item to be useful.
- Blocked uses the label `Blocked` with the running layout and the wait it reports. The design shows only running.
- The landed page shows `Landed`, the task count and first tries, and the land section folded below. It does not show land time, commit or push.
- On a phone the button bar sits at the end of the page and sticks to the bottom of the screen, so in the markup it comes after the folds. Existing "Land before the actions" and review-order rules keep holding.

## Contract

The requirements are in the delta. In short:

- "Change next step in the web document" (added): the three new fields and where each comes from.
- "Change page model" (added): `changePage`, `progressLine`, `haltFacts`, `landLine` and `landedLine` in the browser, pure over the document.
- "Change page layout" (added): head, hand-off, top block, folds and button bar, and the phone-width rules.
- "Change page hand-off" (added): the block, `copyText`, and the plan buttons that open it.
- "Change actions" (modified): Approve and Land in the button bar, Reject, Retry change and manual commands in the `More actions` menu, Retry task in its row.

## Human steps

### Before approval

- Commit `docs/designs/change-page.html` to the default branch. It is untracked in the checkout today, and task 3 reads it from the change's worktree. `docs/` is ungoverned, so no change is needed for it.

### After landing

None

## Delta

- `specs/web-inspection/spec.md`: adds "Change next step in the web document", "Change page model", "Change page layout" and "Change page hand-off"; modifies "Change actions".

Task 4 extends `packages/ui/src/change/ChangeView.tsx`, which task 3 owns. Task 4 runs after task 3, and the watcher recertifies task 3 by itself when its verify still passes.
