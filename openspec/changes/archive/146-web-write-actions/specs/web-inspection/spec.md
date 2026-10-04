## ADDED Requirements

### Requirement: Loopback HTTP transport
One Node `http` server SHALL expose `GET /api/report`, `GET /api/graph`,
`GET /api/system`, `GET /api/changes/<id>`, `GET /api/inbox`,
`GET /api/events`, and production static assets. When `startWebServer` is
given a `runAction`, it SHALL also expose `GET /api/actions/<id>` and
`POST /api/actions/<id>`, which "Loopback write actions" defines. Every
ordinary API request SHALL recompute its document from files and retain no
cache after the response.

The report response SHALL be the exact `MetricsReport` from
`getMetricsReport`, without a wrapper or web-only field. The inbox response
SHALL read the existing last-look cursor and equal a contemporaneous first
`osq --json` projection for the same filesystem and clock, but the HTTP request
SHALL not advance the cursor. Graph and change responses SHALL use the stable
web documents. The system response SHALL be the `SystemGraph` from
`getSystemGraph`, without a wrapper. JSON APIs SHALL use UTF-8, deterministic
serialization, and `Cache-Control: no-store`; failures SHALL return JSON 4xx
or 5xx responses without terminating the server.

GET and HEAD SHALL be supported on every path. HEAD SHALL return its GET
status and headers without a body. POST SHALL be supported only on
`/api/actions/<id>` and only when the server has a `runAction`. Every other
method on that path SHALL return 405 with `Allow: GET, HEAD, POST`. Every
method other than GET and HEAD on every other path, and on every path when
the server has no `runAction`, SHALL return 405 with `Allow: GET, HEAD`,
before route lookup, and no state change. An unknown API GET SHALL return
404; without a `runAction`, `/api/actions/<id>` is unknown. No response SHALL
enable cross-origin resource sharing.

Change selectors SHALL be decoded once and reject path separators, traversal,
or malformed percent encoding. An absent selector SHALL return 404 and an
ambiguous numeric selector 409.

#### Scenario: Report and inbox parity
- **WHEN** API and existing core or CLI projections observe the same fixture and clock
- **THEN** their report and inbox objects are deeply equal while the API leaves last-look state unchanged

#### Scenario: Mutation method is refused
- **WHEN** a client sends POST, PUT, PATCH, or DELETE to any path other than `/api/actions/<id>`, or to any path on a server without a `runAction`
- **THEN** the server returns 405 with `Allow: GET, HEAD` and changes no file

#### Scenario: Malformed change selector
- **WHEN** a change URL decodes to a separator, traversal, or invalid encoding
- **THEN** the server returns a JSON 400 response without reading outside canonical change roots

#### Scenario: System document
- **WHEN** a client requests `GET /api/system` on a fixture project
- **THEN** the body is `serializeWebJson` of `getSystemGraph` for that project, with `Cache-Control: no-store`

#### Scenario: Other method on the actions path
- **WHEN** a client sends PUT to `/api/actions/001` on a server with a `runAction`
- **THEN** the server returns 405 with `Allow: GET, HEAD, POST` and calls no action

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
`target` for `retry`; any other body SHALL return 400 with an error naming
what is wrong, and no action runs. A valid request SHALL call `runAction`
once with the verb, the decoded selector as `change`, and the reason or
target, and SHALL return 200 with the `WebActionResult` it resolves to,
whatever its exit code. When `runAction` rejects, the server SHALL return 500.
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

### Requirement: Change actions
The change view SHALL show, when the dashboard is served by `osq serve` and
not a static export, one button per action of the change's `WebActions`:
`Approve`, `Land`, `Reject` with a reason text field that must be non-empty,
and `Retry task <n>` or `Retry change`. Each `manual` command SHALL show as
text to run in a shell. A tap SHALL post one request with the document's
token, disable every button until it answers, then show the exit code, the
captured stdout and stderr, and on failure the error message and its
`Next:` step, and load the actions again. A 409 answer SHALL show that
another action is running. The actions SHALL load again whenever a fresh
change document arrives. A static export SHALL make no actions request and
show no buttons.

`createActionClient(fetch)` in `packages/ui/src/change/actions-client.ts`
SHALL load `GET /api/actions/<id>`, giving null on 404, and post a
`WebActionRequest` without `change` as JSON with `Content-Type:
application/json` and `X-Osq-Token`.

#### Scenario: Approval buttons
- **WHEN** the change view renders actions holding `approve` and a `manual` `osq plan 001`
- **THEN** it shows an `Approve` button and the text `osq plan 001`, and no other button

#### Scenario: Result after a tap
- **WHEN** a tap answers with exit code 1, an error message, and next step `osq retry 001 2`
- **THEN** the view shows the exit code, the message, and `Next: osq retry 001 2`

#### Scenario: Static export has no buttons
- **WHEN** the change view renders without an action client
- **THEN** it shows no action button and makes no actions request

## REMOVED Requirements

### Requirement: Read-only HTTP transport
**Reason**: `osq serve` now accepts guarded POST requests on `/api/actions/<id>`, so the server is no longer read-only and the scenario "Mutation method is refused" no longer holds for every path.
**Migration**: None. "Loopback HTTP transport" keeps every sentence and scenario of the removed requirement except that POST on the actions path is defined by "Loopback write actions".
