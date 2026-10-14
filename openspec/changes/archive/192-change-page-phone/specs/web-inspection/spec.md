## ADDED Requirements

### Requirement: Change next step in the web document
`getWebChange` SHALL set `nextStep`, `planHandoff` and `autoSteer` on every
change document it builds, read by `readWebChangeNext(projectRoot,
folderPath, location, config)` in `src/core/web/web-data-next.ts`:

- `nextStep` SHALL be what `readNextStep(projectRoot, folderPath, config)`
  returns for the change's folder, the function `osq inbox` uses. It SHALL be
  null for a rejected change and when `readNextStep` throws.
- `planHandoff` SHALL be `{ text, promptReady }`, where `text` is
  `formatPlanPasteBlock(folderPath)` and `promptReady` is true exactly when
  the folder holds `plan-prompt.md`. It SHALL be null for a rejected change.
- `autoSteer` SHALL be `{ outcome, changed }` from the record
  `currentAutoSteer` returns for an active change's derived state, and null
  when it returns none or the change is archived or rejected.

The three fields SHALL be optional on `WebChange`, so documents built before
them stay valid, and a missing field reads as null. The browser chooses the
page from these fields and never reads a marker or derives a next step.

#### Scenario: Change documents carry the next step
- **WHEN** `getWebChange` builds the document for each change below in a project without version control
- **THEN** its fields are:

| Change | `nextStep` | `planHandoff` | `autoSteer` |
|---|---|---|---|
| active `001-demo` with `brief.md` and the planning sentinel verify | `{ state: 'unplanned', command: 'osq plan 001', detail: null }` | `text` is `formatPlanPasteBlock(<folder>)`, `promptReady` false | null |
| the same change after `plan-prompt.md` is written in its folder | `{ state: 'unplanned', command: 'osq plan 001', detail: null }` | `promptReady` true | null |
| approved `001-order-flow` whose task 2 is blocked and whose current automatic steering record says `ready` with `changed: ['tasks/2.md']` | `{ state: 'dead', command: 'osq approve 001', detail: 'revised plan ready' }` | `text` is `formatPlanPasteBlock(<folder>)` | `{ outcome: 'ready', changed: ['tasks/2.md'] }` |
| an archived change | `{ state: 'landed', command: null, detail: null }` | `text` is `formatPlanPasteBlock(<folder>)` | null |
| a rejected change | null | null | null |

### Requirement: Change page model
`packages/ui/src/change/page-model.ts` SHALL export pure functions that turn
a `WebChange` into what the change page shows, reading only the document.

`changePage(change)` SHALL return `{ state, label, summary, main, second }`.
`state` SHALL be `rejected` when the location is `rejected`; else `unknown`
when `nextStep` is missing or null; else `revised` when `nextStep.state` is
`dead` and `autoSteer.outcome` is `ready`; else `nextStep.state`. Below,
`<n>` is the number of tasks, `<k>` the number whose state is `done`, and
the noun after a count is `task` when `<n>` is 1 and `tasks` otherwise:

| `state` | `label` | `summary` | `main` | `second` |
|---|---|---|---|---|
| `unplanned` | `Needs a plan` | `Not planned yet` | `copy` | null |
| `ready-for-approval` | `Waiting for you` | `<n> tasks · planned by <planner>`, or `<n> tasks` when the planner is null | `approve` | `plan-again` |
| `running` | `Running` | `<k> of <n> tasks done` | null | null |
| `blocked` | `Blocked` | `<k> of <n> tasks done` | null | null |
| `dead` | `Halted` | `<k> of <n> tasks done` | `plan-it` | null |
| `revised` | `Waiting for you` | `Halted · revised by the automatic planner` | `approve` | `plan-it-myself` |
| `archived` | `Ready to land` | `<n> tasks done · archived` | `land` | `plan-again` |
| `landed` | `Landed` | `<n> tasks done · landed` | null | null |
| `rejected` | `Rejected` | `<n> tasks` | null | null |
| `unknown` | `Change` | `<k> of <n> tasks done` | null | null |

`progressLine(change)` SHALL return `Task <number> of <n> running ·
<elapsed>` for the first task whose state is `running`, where `<elapsed>`
is `<s>s` under 60 seconds, `<m> min` with the whole minutes from 60
seconds, and `unavailable` when `runningElapsedSeconds` is null; with no
running task it SHALL return `<k> of <n> tasks done`.

`haltFacts(change)` SHALL return `{ heading, reason, touched }` for the first
task whose state is `dead` or `regressed`: `Task <number> stopped: <title>`,
its `reason` or `unavailable`, and the paths of the last line of its result
that starts with `Touched: `, split on `, `, or none. With no such task it
SHALL return `The change stopped`, `nextStep.detail` or `unavailable`, and
no paths.

`landLine(land)` SHALL return the first line that applies: `Halted:
<halt.message>` when `halt` is set; `Sync stopped: <lastSyncStop.message>`
when `lastSyncStop` is set; `<gate> failed` for the first gate whose outcome
is `failed`, with the gate named `Task <n>`, `Verify`, `Check` or
`Validator`; `No gates recorded` without gates; else `All <g> gates passed`,
with `gate` when `<g>` is 1.

`landedLine(change)` SHALL return `<n> tasks, <f> first try`, where `<f>`
counts the done tasks with exactly 1 attempt.

#### Scenario: Page per state
- **WHEN** `changePage` reads a document with three tasks, one of them done, planner `claude-opus-5-5`, and each next step below
- **THEN** it returns:

| Document | `state` | `label` | `summary` | `main` | `second` |
|---|---|---|---|---|---|
| `nextStep.state` `unplanned` | `unplanned` | `Needs a plan` | `Not planned yet` | `copy` | null |
| `nextStep.state` `ready-for-approval` | `ready-for-approval` | `Waiting for you` | `3 tasks · planned by claude-opus-5-5` | `approve` | `plan-again` |
| `nextStep.state` `running` | `running` | `Running` | `1 of 3 tasks done` | null | null |
| `nextStep.state` `blocked` | `blocked` | `Blocked` | `1 of 3 tasks done` | null | null |
| `nextStep.state` `dead`, `autoSteer` null | `dead` | `Halted` | `1 of 3 tasks done` | `plan-it` | null |
| `nextStep.state` `dead`, `autoSteer.outcome` `ready` | `revised` | `Waiting for you` | `Halted · revised by the automatic planner` | `approve` | `plan-it-myself` |
| `nextStep.state` `archived` | `archived` | `Ready to land` | `3 tasks done · archived` | `land` | `plan-again` |
| `nextStep.state` `landed` | `landed` | `Landed` | `3 tasks done · landed` | null | null |
| location `rejected`, `nextStep` null | `rejected` | `Rejected` | `3 tasks` | null | null |
| no `nextStep` field | `unknown` | `Change` | `1 of 3 tasks done` | null | null |

#### Scenario: Progress line
- **WHEN** `progressLine` reads a document with three tasks, one done, and the tasks below
- **THEN** it returns:

| Tasks | Line |
|---|---|
| task 2 `running` with `runningElapsedSeconds` 42 | `Task 2 of 3 running · 42s` |
| task 2 `running` with `runningElapsedSeconds` 750 | `Task 2 of 3 running · 12 min` |
| task 2 `running` with `runningElapsedSeconds` null | `Task 2 of 3 running · unavailable` |
| no running task | `1 of 3 tasks done` |

#### Scenario: Halt facts
- **WHEN** `haltFacts` reads a document whose task 4, `Inbox rows`, is `dead` with reason `verify_red` and a result ending in `Touched: src/core/status/inbox.ts, tests/inbox.test.ts`
- **THEN** it returns heading `Task 4 stopped: Inbox rows`, reason `verify_red`, and touched `src/core/status/inbox.ts` and `tests/inbox.test.ts`; and for a document with no dead or regressed task and `nextStep.detail` `needs steering`, heading `The change stopped`, reason `needs steering`, and no paths

#### Scenario: Land line
- **WHEN** `landLine` reads each land view below
- **THEN** it returns:

| Land view | Line |
|---|---|
| four gates, all `passed` | `All 4 gates passed` |
| one gate, `passed` | `All 1 gate passed` |
| task 2 gate `failed` | `Task 2 failed` |
| no gates | `No gates recorded` |
| `lastSyncStop` message `merge conflict in src/a.ts` | `Sync stopped: merge conflict in src/a.ts` |
| `halt` message `verify failed after sync` and `lastSyncStop` set | `Halted: verify failed after sync` |

#### Scenario: Landed line
- **WHEN** `landedLine` reads a document with four done tasks, three of them with 1 attempt and one with 2
- **THEN** it returns `4 tasks, 3 first try`

### Requirement: Change page layout
The change view SHALL show one layout for every change, built from
`changePage` and the functions beside it, in this order:

1. The head: the label in `<p class="page-label">`, the title as the `h2`
   with id `change-view-title`, and the summary in `<p class="page-summary">`.
2. The error alert with its Retry button, as before this requirement.
3. The hand-off block, when a plan button opened it.
4. The top block in `<section class="page-block">`, by state: for
   `unplanned`, the hand-off block; for `ready-for-approval` and `unknown`,
   the `Notices` section when the review has notices; for `running`, the
   progress line, the running task's title, and `Nothing for you to do. The
   inbox shows it when it needs you.`; for `blocked`, the same with the next
   step's detail, its first letter in capitals, after the progress line; for
   `dead`, the halt heading, `Reason: <reason>`, and `Touched` with each path
   when there are any; for `revised`, `Revised plan ready`, `The automatic
   planner changed the plan, and it lints clean.`, and `Changed` with each
   path of `autoSteer.changed`; for `archived`, the land line and, when the
   land view has a diff, `<files> files changed, +<added> -<removed>`; for
   `landed`, `Landed` and the landed line; for `rejected`, `Rejected:
   <reason>`, or `Rejected` without a rejection.
5. The folds, each a `<details class="page-fold">` closed at first, in this
   order and each only when it has content: `Brief` with the brief panel,
   `Plan` with the review sections and deltas, `Land` with the land section,
   `Tasks · <k> of <n> done` with the task table, `Approval digest` with the
   digest, and `About this change` with the header's folder key, location,
   state, runs after, planner, derivation time and rejection.
6. The button bar, `<div class="page-buttons">`: the main button, then the
   second button. `plan-it`, `plan-again` and `plan-it-myself` SHALL be
   buttons with class `page-button` labelled `Plan it`, `Plan again` and
   `Plan it myself`, shown with or without an action client and only when
   the document has a `planHandoff`. `approve` and `land` SHALL follow
   "Change actions". `copy` is the hand-off block's own button.

The page SHALL work at 390 px wide with no horizontal page scroll: text in
the head, the blocks and the hand-off wraps, and the task table scrolls
inside its fold. Every button and every fold or menu summary SHALL be at
least 44 px tall. The same page SHALL serve wider screens.

#### Scenario: Page order
- **WHEN** the change view renders a `running` document with a review, a brief and two tasks
- **THEN** the label, the title, the summary, the top block, the folds `Brief`, `Plan`, `Tasks · 0 of 2 done`, `Approval digest` and `About this change`, and the button bar appear in that order, and every fold is closed

#### Scenario: Top block per state
- **WHEN** the change view renders a document in each state below
- **THEN** its top block holds:

| State | Top block holds |
|---|---|
| `unplanned` | `Hand it to your planning agent` and the `Copy hand-off` button |
| `ready-for-approval` with a review with notices | the `Notices` heading |
| `running`, task 2 of 3 running for 42 seconds | `Task 2 of 3 running · 42s` and `Nothing for you to do. The inbox shows it when it needs you.` |
| `blocked`, detail `waiting for 001-a` | `Waiting for 001-a` |
| `dead`, task 4 `Inbox rows` dead with reason `verify_red` | `Task 4 stopped: Inbox rows` and `Reason: verify_red` |
| `revised`, `autoSteer.changed` `['tasks/2.md']` | `Revised plan ready` and `tasks/2.md` |
| `archived`, four passed gates | `All 4 gates passed` |
| `landed`, two done tasks with 1 attempt | `Landed` and `2 tasks, 2 first try` |
| `rejected`, reason `superseded` | `Rejected: superseded` |

#### Scenario: Plan buttons without an action client
- **WHEN** the change view renders a `dead` document with a `planHandoff` and no action client
- **THEN** it shows a `Plan it` button with class `page-button` and no `action-button`

#### Scenario: Change page at phone width
- **WHEN** the change page's style sheet is read
- **THEN** `.page-button`, `.action-button`, `.page-fold > summary` and `.page-menu > summary` each have `min-height: 44px`, the hand-off and block text wraps with `overflow-wrap: anywhere`, and the task table's container scrolls with `overflow-x: auto`

### Requirement: Change page hand-off
The hand-off block SHALL be a `<section class="handoff">` holding the heading
`Hand it to your planning agent`, `Paste this into a new agent session.`,
the `planHandoff.text` in `<pre class="handoff-text">`, the line `This folder
has no plan-prompt.md yet; run osq plan for this change first.` only when
`promptReady` is false, and a `Copy hand-off` button with class
`page-button`. Without a `planHandoff` there SHALL be no hand-off block.

A tap on `Copy hand-off` SHALL call `copyText(text, clipboard)` from
`packages/ui/src/change/HandoffBlock.tsx` with `navigator.clipboard`, which
resolves true after `writeText(text)` succeeds and false when the clipboard
is missing or `writeText` rejects. After true the button SHALL read
`Copied`; after false the block SHALL show `Copy failed; select the text
above.` A tap on `Plan it`, `Plan again` or `Plan it myself` SHALL show the
hand-off block for the same change, and a second tap SHALL hide it. Nothing
on the page starts a planner.

#### Scenario: Hand-off text
- **WHEN** the change view renders an `unplanned` document whose `planHandoff` is `{ text: 'You are the planner for osq change 001-demo.\n', promptReady: false }`
- **THEN** the hand-off block shows that text in `<pre class="handoff-text">`, the no-prompt line, and the `Copy hand-off` button

#### Scenario: Prompt ready
- **WHEN** the same document's `promptReady` is true
- **THEN** the hand-off block has no no-prompt line

#### Scenario: Copy outcome
- **WHEN** `copyText('block', clipboard)` runs with each clipboard below
- **THEN** it resolves:

| Clipboard | Result |
|---|---|
| `writeText` resolves, recording its argument | true, and `writeText` received `block` |
| `writeText` rejects | false |
| undefined | false |

## MODIFIED Requirements

### Requirement: Change actions
The change view SHALL show, when the dashboard is served by `osq serve` and
not a static export, the actions of the change's `WebActions` where they
apply. When the page's `main` is `approve` and the actions hold `approve`,
the button bar SHALL show an `Approve` button; when `main` is `land` and the
actions hold `land`, a `Land` button. Each is a `button` with class
`action-button` inside a `div` with class `action-item`, which for Approve
also holds the red-notice note and the review's flags. When the actions hold
no `approve`, the flags SHALL show above the button bar.

The head SHALL hold a `More actions` menu, a `<details class="page-menu">`
whose summary has `aria-label="More actions"`, when the actions hold
`reject`, a `retry` with target `change`, or a `manual` command. It SHALL
show `Reject` with a reason text field that must be non-empty, `Retry
change`, and each `manual` command as code to run in a shell. A `retry` with
a task target SHALL show as a `Retry task <n>` button in that task's row of
the task table.

A tap SHALL post one request with the document's token, disable every action
button until it answers, then show the exit code, the captured stdout and
stderr, and on failure the error message and its `Next:` step, and load the
actions again. A 409 answer SHALL show that another action is running. The
actions SHALL load again whenever a fresh change document arrives. A static
export SHALL make no actions request and show no action button.

`createActionClient(fetch)` in `packages/ui/src/change/actions-client.ts`
SHALL load `GET /api/actions/<id>`, giving null on 404, and post a
`WebActionRequest` without `change` as JSON with `Content-Type:
application/json` and `X-Osq-Token`.

#### Scenario: Approval buttons
- **WHEN** the change page renders a `ready-for-approval` change with actions holding `approve` and a `manual` `osq plan 001`
- **THEN** the button bar shows an `Approve` action button, the `More actions` menu shows the text `osq plan 001`, and no other action button shows

#### Scenario: Result after a tap
- **WHEN** a tap answers with exit code 1, an error message, and next step `osq retry 001 2`
- **THEN** the view shows the exit code, the message, and `Next: osq retry 001 2`

#### Scenario: Static export has no buttons
- **WHEN** the change view renders without an action client
- **THEN** it shows no action button and makes no actions request

#### Scenario: Reject in the menu
- **WHEN** the change page renders actions holding `approve`, `reject` and `retry` with target `2`, and task 2 is in the task table
- **THEN** `Reject` and its reason field are inside the `More actions` menu, `Retry task 2` is inside task 2's row, and the button bar holds only `Approve`
