## MODIFIED Requirements

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

### Requirement: Typed UI data boundary
The React application SHALL have one data module that owns every report, graph,
inbox, change, and events access, and one server status client that owns the
`api/server` access. When typed `window.__OSQ_DATA__` exists, the
module SHALL prefer its report, graph, inbox, and keyed change documents;
otherwise it SHALL use only same-origin `/api/*` fetches, prefixed with
`/p/<project>` when the page is served under `/p/<project>/`. UI components
SHALL receive documents and callbacks and SHALL NOT invoke fetch or construct
an EventSource.

The UI SHALL import `MetricsReport`, `Inbox`, `WebGraph`, and `WebChange` using
`import type` only. No module below `src/` SHALL import from `packages/ui`, and
no module below `packages/ui` SHALL import a runtime value from `src/`. The
application SHALL use a small hash route for home, changes list, report, graph,
and change views, with no routing or state-management dependency. The empty
hash and `#/` SHALL open home, and an unknown hash SHALL fall back to home.

On a `changed` event, the data layer SHALL refetch report, graph, and inbox plus
the open change when its id is listed or the id list is empty. It SHALL not
interpret paths, markers, or event payloads as application state.

#### Scenario: Static inlined documents
- **WHEN** the global data document contains the selected route's inputs
- **THEN** the view renders without a fetch or events connection

#### Scenario: Live invalidation
- **WHEN** an SSE changed event affects the selected change
- **THEN** the data layer refetches common documents and that change before updating the view

#### Scenario: Architecture boundary
- **WHEN** import-graph verification scans CLI and UI sources
- **THEN** dependency direction and type-only core imports satisfy the one-way boundary

## ADDED Requirements

### Requirement: Project paths on a server
`startWebServer` SHALL take an optional `site`, a `WebServerSite` from
`src/core/web/web-site.ts` holding the server's `name` and `project`. Without
a `site` the server SHALL behave exactly as "Loopback HTTP transport" and
"Loopback write actions" say, and SHALL answer no `/p/` path and no
`/api/server`.

With a `site`, every path the server answers SHALL sit under
`/p/<project>/`: a request for `/p/<project>/<rest>` SHALL be handled exactly
as a server without a `site` handles `/<rest>`, the actions guard, the token
and the method rules included, and `/p/<project>/` SHALL serve the
dashboard's `index.html`. `GET` and `HEAD` of `/` and of `/p/<project>` SHALL
return 302 with `Location: /p/<project>/`. Any other path SHALL return 404
with `{"error":"not found"}`. The handle's `url` SHALL be
`http://127.0.0.1:<port>/p/<project>/`.

`GET /p/<project>/api/server` SHALL return the `WebServerStatus` from
`readServerStatus(projectRoot, site, home)`: the site's `name` and `project`,
`path` `/p/<project>/`, and the project's `service` and `watcher` records and
`log` path as `readWatchState` reads them at the time of the request, with
`Cache-Control: no-store`.

#### Scenario: Paths with a site
- **WHEN** a server started with site `{ name: 'box', project: 'osq' }` receives each GET below
- **THEN** it answers as the table says:

| Path | Status | Body or header |
|---|---|---|
| `/` | 302 | `Location: /p/osq/` |
| `/p/osq` | 302 | `Location: /p/osq/` |
| `/p/osq/` | 200 | the dashboard's `index.html` |
| `/p/osq/api/report` | 200 | the report document |
| `/p/osq/api/server` | 200 | the status document |
| `/api/report` | 404 | `{"error":"not found"}` |
| `/p/other/api/report` | 404 | `{"error":"not found"}` |

#### Scenario: Write through the project path
- **WHEN** a server with a site and a `runAction` receives a valid POST to `/p/osq/api/actions/001` with the token, an allowed host and origin
- **THEN** `runAction` receives the request for change `001`, and the same POST to `/api/actions/001` returns 404 without calling it

#### Scenario: Status document
- **WHEN** the project's `service.json` and `watcher.json` name live pids and the watcher record's `waiting` is `osq build is stale`
- **THEN** `/p/osq/api/server` returns `name` `box`, `project` `osq`, `path` `/p/osq/`, the service's pid, and the watcher's mode, version, commit and `waiting`

#### Scenario: No site, no project paths
- **WHEN** a server started without a site receives `GET /api/server` and `GET /p/osq/api/report`
- **THEN** both return 404 and the server's `url` has no `/p/` path

### Requirement: Server header and service panel
The dashboard SHALL resolve its API base from the page's path: under
`/p/<project>/` the data module, the actions client and the event source
SHALL request paths under `/p/<project>/api/`; anywhere else they SHALL
request `/api/` paths exactly as before. Only under `/p/<project>/` SHALL the
dashboard request `api/server`, once when it starts and again on every
refresh and every `changed` event; a failed request SHALL leave the last
status shown.

With a status, the header SHALL show `<project> on <name>` next to the title,
and the home view SHALL open with a Service panel before its groups. The
panel SHALL say:

- `Watcher: running in the background` or `Watcher: running in a terminal`, by the watcher record's `mode`, with its `version`, `commit` and `startedAt`; or `Watcher: not running` when there is no watcher record;
- `Waiting: <reason>` as a warning when the watcher's `waiting` is not null;
- `Service log: <log>` when there is a service record.

Without a status, as under `osq serve` and in a static export, the header and
the home view SHALL render as before. The header and panel SHALL fit a
360-pixel-wide screen without horizontal scrolling.

#### Scenario: Header on a server
- **WHEN** the dashboard is opened at `/p/osq/` and `api/server` returns name `box` and project `osq`
- **THEN** the header shows `osq on box`

#### Scenario: Service panel states
- **WHEN** the home view renders with each status below
- **THEN** the Service panel shows the lines in the table:

| Watcher record | Service record | Lines |
|---|---|---|
| mode `background`, waiting null | present, log `/h/.osq/watch/x/watch.log` | `Watcher: running in the background`, `Service log: /h/.osq/watch/x/watch.log` |
| mode `terminal`, waiting null | none | `Watcher: running in a terminal` |
| mode `background`, waiting `osq build is stale` | present | `Watcher: running in the background`, `Waiting: osq build is stale`, `Service log: ...` |
| none | none | `Watcher: not running` |

#### Scenario: Loopback dashboard unchanged
- **WHEN** the dashboard is opened at `/` and has no status
- **THEN** it requests no `api/server`, its requests use `/api/` paths, and the header and home view render as before
