## ADDED Requirements

### Requirement: Change documents carry the planner run
A change document SHALL carry `planRun`, a `WebPlanRun`
`{ outcome, startedAt, detail }`, or null. `readWebChangeNext` SHALL derive
it for an active change from `currentPlanRun(state)`: `outcome` and `detail`
as it returns them, and `startedAt` its `at` while the outcome is `running`,
else null. It SHALL be null when `currentPlanRun` returns null, for an
archived or rejected change, and when the state cannot be derived. On the
`WebChange` type the field SHALL be optional, so older documents still read.

#### Scenario: Running planner in the document
- **WHEN** the server builds the document of an unapproved change whose `.run/plan-run.md` holds a `running` record with `at` `2026-10-14T09:30:00.000Z` and the test's own pid
- **THEN** its `planRun` is `{ "outcome": "running", "startedAt": "2026-10-14T09:30:00.000Z", "detail": null }` and its `nextStep.state` is `planning`

#### Scenario: Finished planner in the document
- **WHEN** the record is a `lint_red` record with body `- tasks/1.md: verify is the planning sentinel` and its `hash` matches the folder
- **THEN** `planRun` is `{ "outcome": "lint_red", "startedAt": null, "detail": "- tasks/1.md: verify is the planning sentinel" }`

#### Scenario: No planner run
- **WHEN** the change folder has no `.run/plan-run.md` and no `.run/auto-steer.md`
- **THEN** `planRun` is null

### Requirement: Change page while planning
When the page's state is `planning`, the top block SHALL show
`<p class="page-planning">` with `planningLine(change, now)` and
`<p class="page-note">` with `The plan comes back here when it lints clean.`,
and no hand-off block and no plan button SHALL show. `ChangeView` SHALL pass
`now` as the time of its last render and render again every 30 seconds while
the state is `planning`, so the minutes move without a new document.

#### Scenario: Planning top block
- **WHEN** the change view renders a document whose `nextStep.state` is `planning` and whose `planRun.startedAt` is 750 seconds before `now`
- **THEN** it shows `Planning on server · 12 min` and `The plan comes back here when it lints clean.`, no `Copy hand-off` button, and no `Start planning`, `Plan it` or `Plan again` button

## MODIFIED Requirements

### Requirement: Change page model
`packages/ui/src/change/page-model.ts` SHALL export pure functions that turn
a `WebChange` into what the change page shows, reading only the document and
the arguments they name.

`changePage(change)` SHALL return `{ state, label, summary, main, second }`.
`state` SHALL be `rejected` when the location is `rejected`; else `unknown`
when `nextStep` is missing or null; else `revised` when `nextStep.state` is
`dead` and `autoSteer.outcome` is `ready`; else `nextStep.state`. Below,
`<n>` is the number of tasks, `<k>` the number whose state is `done`, and
the noun after a count is `task` when `<n>` is 1 and `tasks` otherwise:

| `state` | `label` | `summary` | `main` | `second` |
|---|---|---|---|---|
| `unplanned` | `Needs a plan` | `Not planned yet` | `copy` | null |
| `planning` | `Planning` | `Planner running` | null | null |
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

`planningLine(change, now)` SHALL return `Planning on server · <elapsed>`,
with `<elapsed>` formatted as in `progressLine` from the whole seconds
between `planRun.startedAt` and `now`, a time in milliseconds, and never less
than 0; `<elapsed>` SHALL be `unavailable` when `planRun` or its `startedAt`
is missing or null.

`planRunLine(change)` SHALL return null unless `planRun` is set, and then by
its outcome: `The last planner run changed nothing.` for `unchanged`, `The
last planner run left the plan failing osq lint.` for `lint_red`, `The last
planner run timed out.` for `timed_out`, `The last planner run failed:
<line>` for `failed` with `<line>` the first line of `detail`, or `The last
planner run failed.` when `detail` is null, and null for `running` and
`ready`.

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

#### Scenario: Planning page
- **WHEN** `changePage` reads a document with three tasks whose `nextStep.state` is `planning`
- **THEN** it returns state `planning`, label `Planning`, summary `Planner running`, and null `main` and `second`

#### Scenario: Planning line
- **WHEN** `planningLine` reads a document whose `planRun.startedAt` is `2026-10-14T09:30:00.000Z` with each `now` below
- **THEN** it returns:

| `now` | Line |
|---|---|
| `2026-10-14T09:30:42.000Z` | `Planning on server · 42s` |
| `2026-10-14T09:42:30.000Z` | `Planning on server · 12 min` |
| `2026-10-14T09:29:00.000Z` | `Planning on server · 0s` |
| any, with `planRun` null | `Planning on server · unavailable` |

#### Scenario: Planner run line
- **WHEN** `planRunLine` reads each `planRun` below
- **THEN** it returns:

| `planRun` | Line |
|---|---|
| null | null |
| `running` | null |
| `ready` | null |
| `unchanged` | `The last planner run changed nothing.` |
| `lint_red` | `The last planner run left the plan failing osq lint.` |
| `timed_out` | `The last planner run timed out.` |
| `failed`, detail `exit 1\nmore` | `The last planner run failed: exit 1` |
| `failed`, detail null | `The last planner run failed.` |

### Requirement: Loopback write actions
`startWebServer` SHALL take an optional `runAction`, a `WebActionRunner`
from `src/core/web/web-actions.ts`, and SHALL never import from `src/cli/`.
Each server SHALL create one token of 32 random bytes from `node:crypto`,
hex-encoded, when it starts. A request's host is allowed when its `Host`
header is `127.0.0.1:<port>` or `localhost:<port>`, with `<port>` the bound
port, or exactly equals an entry of the server config's `serve.allowedHosts`;
an origin is allowed when it is `http://` or `https://` followed by an
allowed host. The server SHALL still bind only `127.0.0.1`; no setting binds
another address.

`GET /api/actions/<id>` SHALL return 403 with
`{"error":"request refused"}` when the host is not allowed or an `Origin`
header is present and not allowed. Otherwise it SHALL return the
`WebActions` document from `getWebActions` for that change with a `token`
field holding the server's token.

`getWebActions(projectRoot, selector, config)` SHALL resolve the change with
`resolveChangeFolder` and read `readDispatchItems`. For each command of the
items whose folder is that change's folder key, in item order: `osq approve
<id>`, `osq land <id>`, `osq reject <id> --reason <text>`, and
`osq retry <id> <target>` SHALL each be one action with its verb, the
command, and the retry target or null; `osq show <id>` SHALL be left out; any
other command SHALL be listed in `manual`. When there is no such item and the
change's `readNextStep` state is `unplanned`, `manual` SHALL hold that next
step's command. Repeated commands SHALL appear once. When
`canStartPlanner(next, location, config)` is true for the change's next step
and location, the actions SHALL end with one `plan` action whose command is
`osq plan <id> --run` and whose target is null.

`POST /api/actions/<id>` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read and before any
state changes, unless the host is allowed, the `Origin` header is present and
allowed, the `Content-Type` media type is `application/json`, and the
`X-Osq-Token` header equals the server's token under a constant-time compare.
A selector that fails decoding SHALL then return 400. While another action
runs on the same server, the request SHALL return 409 with
`{"error":"another action is running"}` and SHALL not be queued. The body
SHALL be a JSON object with `verb` one of `approve`, `land`, `reject`,
`retry`, or `plan`, a non-empty string `reason` for `reject`, and a non-empty
string `target` for `retry`; an `approve` body MAY carry `opened`, a list of
strings, and a `plan` body MAY carry `notes`, a non-empty string. Any other
body SHALL return 400 with an error naming what is wrong, and no action runs;
an unknown verb's error SHALL be `verb must be approve, land, reject, retry,
or plan`. A valid request SHALL call `runAction` once with the verb, the
decoded selector as `change`, the reason or target, for `approve` the
`opened` list only when the body carries one, and for `plan` the `notes` only
when the body carries them, and SHALL return 200 with the
`WebActionResult` it resolves to, whatever its exit code. When `runAction`
rejects, the server SHALL return 500.
The running action SHALL end, by result or failure, before the next one can
start. A `plan` action ends once the planner process has started, so it holds
the one-action slot only that long.

#### Scenario: Actions for an approval
- **WHEN** a client with an allowed host requests `GET /api/actions/001` for a change ready for approval
- **THEN** the body holds the token, the action `approve` with command `osq approve 001`, and an empty `manual`

#### Scenario: Unplanned change shows plan
- **WHEN** a client requests the actions of an unapproved change that has a brief and the planning sentinel verify
- **THEN** there is no action and `manual` is `osq plan <id>`

#### Scenario: Foreign host
- **WHEN** a request to `/api/actions/001` carries `Host: evil.example:<port>`
- **THEN** the server returns 403, sends no token, and calls no action

#### Scenario: Write without proof
- **WHEN** a POST to `/api/actions/001` lacks the token, carries a wrong token, lacks `Origin`, carries another site's `Origin`, or is not `application/json`
- **THEN** the server returns 403, does not call `runAction`, and changes no file

#### Scenario: Valid write
- **WHEN** osq's page posts `{"verb":"retry","target":"2"}` to `/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives `retry` for change `001` with target `2`, and the response is 200 with its result

#### Scenario: One write at a time
- **WHEN** a second valid POST arrives while the first action has not finished
- **THEN** the second returns 409 without calling `runAction`, and a POST after the first finishes runs

#### Scenario: Bad body
- **WHEN** a valid POST carries invalid JSON, an unknown verb, `reject` without a reason, or `retry` without a target
- **THEN** the server returns 400 and does not call `runAction`

#### Scenario: Approve with opened notices
- **WHEN** osq's page posts `{"verb":"approve","opened":["rules_path"]}` to `/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives `approve` for change `001` with `opened` `["rules_path"]`, while `{"verb":"approve","opened":"rules_path"}` returns 400 without calling it

#### Scenario: Configured host behind a proxy
- **WHEN** `serve.allowedHosts` is `['box.tail1234.ts.net']` and a POST to `/api/actions/001` carries `Host: box.tail1234.ts.net`, `Origin: https://box.tail1234.ts.net`, the token, and `application/json`
- **THEN** `runAction` is called once and the response is 200

#### Scenario: Hosts judged against the list
- **WHEN** a `GET /api/actions/001` carries each `Host` below, with no `Origin`, on a server bound to port 4180
- **THEN** the status is the one in the table:

| `serve.allowedHosts` | `Host` | Status |
|---|---|---|
| `[]` | `127.0.0.1:4180` | 200 |
| `[]` | `box.tail1234.ts.net` | 403 |
| `['box.tail1234.ts.net']` | `box.tail1234.ts.net` | 200 |
| `['box.tail1234.ts.net']` | `box.tail1234.ts.net:4180` | 403 |
| `['box.tail1234.ts.net:8443']` | `box.tail1234.ts.net:8443` | 200 |
| `['box.tail1234.ts.net']` | `evil.example` | 403 |

#### Scenario: Plan action offered
- **WHEN** with `vcs.enabled` on, a client requests the actions of an unapproved change 001 that has a brief and the planning sentinel verify
- **THEN** the actions are exactly one `plan` action with command `osq plan 001 --run` and target null, and `manual` is `osq plan 001`

#### Scenario: Plan action bodies
- **WHEN** a valid POST to `/api/actions/001` carries each body below
- **THEN** the result is the one below:

| Body | Result |
|---|---|
| `{"verb":"plan"}` | `runAction` receives `plan` for change `001` with no `notes` |
| `{"verb":"plan","notes":"use the cache"}` | `runAction` receives `plan` for change `001` with `notes` `use the cache` |
| `{"verb":"plan","notes":""}` | 400, `runAction` not called |
| `{"verb":"plan","notes":3}` | 400, `runAction` not called |
| `{"verb":"merge"}` | 400 with error `verb must be approve, land, reject, retry, or plan` |

#### Scenario: Server runs the plan command
- **WHEN** the server's action runner, `osq serve`'s default table or the server worker's `createServerCommands`, runs a `plan` request for change `001` with notes `use the cache`
- **THEN** it calls `planCommand` with `001`, `run` true and notes `use the cache`, with the request's inputs

### Requirement: Change page hand-off
The hand-off block SHALL be a `<section class="handoff">` holding the heading
`Hand it to your planning agent`, `Paste this into a new agent session.`,
the `planHandoff.text` in `<pre class="handoff-text">`, the line `This folder
has no plan-prompt.md yet; run osq plan for this change first.` only when
`promptReady` is false, and a `Copy hand-off` button with class
`page-button`. Without a `planHandoff` there SHALL be no hand-off block.

When the change's `WebActions` hold a `plan` action, the hand-off block SHALL
start with a `Start planning` button with class `page-button` and the line
`Runs the planner on the server, in its own tree, and brings the plan back
here.` A tap SHALL run that action as every other action runs, and the button
SHALL be disabled while an action is pending. Without a `plan` action, or in
a static export, there SHALL be no `Start planning` button. When
`planRunLine(change)` is not null, the hand-off block SHALL show it in
`<p class="handoff-outcome">` before the paste text.

A tap on `Copy hand-off` SHALL call `copyText(text, clipboard)` from
`packages/ui/src/change/HandoffBlock.tsx` with `navigator.clipboard`, which
resolves true after `writeText(text)` succeeds and false when the clipboard
is missing or `writeText` rejects. After true the button SHALL read
`Copied`; after false the block SHALL show `Copy failed; select the text
above.` A tap on `Plan it`, `Plan again` or `Plan it myself` SHALL show the
hand-off block for the same change, and a second tap SHALL hide it.

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

#### Scenario: Start planning button
- **WHEN** the change view renders an `unplanned` document with an action client whose actions are one `plan` action, and `Start planning` is tapped
- **THEN** the hand-off block starts with `Start planning` and the line about the server, the client posted `{"verb":"plan"}` once, and the view shows the action's result

#### Scenario: Start planning after Plan it
- **WHEN** the change view renders a `dead` document with detail `needs steering`, actions holding `plan`, and `Plan it` is tapped
- **THEN** the opened hand-off block starts with `Start planning`

#### Scenario: No start without the action
- **WHEN** the change view renders the `unplanned` document without an action client, or with actions that hold no `plan`
- **THEN** there is no `Start planning` button and the hand-off block still shows `Copy hand-off`

#### Scenario: Last run outcome
- **WHEN** the change view renders an `unplanned` document whose `planRun` is `{ outcome: 'lint_red', startedAt: null, detail: '- tasks/1.md: bad' }`
- **THEN** the hand-off block shows `The last planner run left the plan failing osq lint.` in `<p class="handoff-outcome">`
