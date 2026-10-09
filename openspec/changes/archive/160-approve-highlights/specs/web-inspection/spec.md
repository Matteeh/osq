## MODIFIED Requirements

### Requirement: Loopback write actions
`startWebServer` SHALL take an optional `runAction`, a `WebActionRunner`
from `src/core/web/web-actions.ts`, and SHALL never import from `src/cli/`.
Each server SHALL create one token of 32 random bytes from `node:crypto`,
hex-encoded, when it starts. A request's host is allowed when its `Host`
header is `127.0.0.1:<port>` or `localhost:<port>`, with `<port>` the bound
port; an origin is allowed when it is `http://` followed by an allowed host.

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
step's command. Repeated commands SHALL appear once.

`POST /api/actions/<id>` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read and before any
state changes, unless the host is allowed, the `Origin` header is present and
allowed, the `Content-Type` media type is `application/json`, and the
`X-Osq-Token` header equals the server's token under a constant-time compare.
A selector that fails decoding SHALL then return 400. While another action
runs on the same server, the request SHALL return 409 with
`{"error":"another action is running"}` and SHALL not be queued. The body
SHALL be a JSON object with `verb` one of `approve`, `land`, `reject`, or
`retry`, a non-empty string `reason` for `reject`, and a non-empty string
`target` for `retry`; an `approve` body MAY carry `opened`, a list of strings.
Any other body SHALL return 400 with an error naming what is wrong, and no
action runs. A valid request SHALL call `runAction` once with the verb, the
decoded selector as `change`, the reason or target, and for `approve` the
`opened` list only when the body carries one, and SHALL return 200 with the
`WebActionResult` it resolves to, whatever its exit code. When `runAction`
rejects, the server SHALL return 500.
The running action SHALL end, by result or failure, before the next one can
start.

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

## ADDED Requirements

### Requirement: Approve notices document
A `WebReview` SHALL carry `notices`, the `ApprovalNotices` that
`buildApprovalNotices` derives for the change and its review digest.
`getWebChange` SHALL always set it on a review; the type declares it optional
so documents built before it stay valid.

#### Scenario: Review with notices
- **WHEN** an unapproved change's delta removes a requirement
- **THEN** `review.notices` equals `buildApprovalNotices` for the folder and holds the `removed_requirement` notice

### Requirement: Notice block view
For a review with `notices`, the change view SHALL show a `Notices` section
after the header and before the brief. When `unusual` is false, it SHALL first
read `Nothing unusual`. Each of the first `maxShown` notices SHALL be an item
that opens to its detail; its summary names the severity in a word (`Red`,
`Amber` or `Grey`) and the label, and the item's severity class draws a
coloured stripe from the dashboard's status tokens, so severity reads by word,
stripe and colour in both themes. The other notices SHALL sit inside one item
summarised `<k> more`. The section's text SHALL wrap at phone width without
horizontal page scroll.

While a red notice has not been opened in the view, the Approve button SHALL
be disabled, with `Open each red notice to approve: <label>, <label>` beside
it. An Approve tap SHALL post `opened`, the ids of the notices opened so far,
sorted. A review without `notices` SHALL render and post exactly as before
this requirement.

#### Scenario: Nothing unusual
- **WHEN** a review's notices hold only a grey notice
- **THEN** the `Notices` section reads `Nothing unusual` and shows the grey notice with the word `Grey`

#### Scenario: Folded notices
- **WHEN** a review holds seven notices with `maxShown` 5
- **THEN** five items show and a sixth item summarised `2 more` holds the other two

#### Scenario: Red notice gates Approve
- **WHEN** the actions hold `approve` and the review's red notice `removed_requirement` has not been opened
- **THEN** the Approve button is disabled and names `removes requirements`, and once it is opened the button is enabled and a tap posts `{"verb":"approve","opened":["removed_requirement"]}`

#### Scenario: Notices at phone width
- **WHEN** the notice block is viewed at a narrow width
- **THEN** its text wraps and nothing scrolls the page sideways
