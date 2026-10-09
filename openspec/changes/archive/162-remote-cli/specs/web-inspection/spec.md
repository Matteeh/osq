## ADDED Requirements

### Requirement: Forwarded command endpoint
`startWebServer` SHALL take an optional `runCommand`, a
`ForwardedCommandRunner` from `src/core/web/web-remote.ts`, and SHALL serve
the paths below only when it has both a `site` and a `runCommand`. A server
without either SHALL answer `/api/commands` and every `/api/files/` path
exactly as it does today, so `osq serve` does not change. The paths sit under
`/p/<project>/` like every other path of a site.

The command paths SHALL have their own token, 32 random bytes from
`createActionToken`, created when the server starts. Host and origin are
judged as "Loopback write actions" judges them.

`GET api/commands` SHALL return 403 with `{"error":"request refused"}` when
the host is not allowed or an `Origin` header is present and not allowed, and
otherwise 200 with `{"token":"<token>"}`.

`POST api/commands` SHALL be refused with 403 and
`{"error":"write request refused"}`, before its body is read, unless the host
is allowed, the `Origin` header is present and allowed, the `Content-Type`
media type is `application/json`, and `X-Osq-Token` equals the command token
under a constant-time compare. The body SHALL be a JSON object with a string
`command`, an array `args` and an object `options`; any other body SHALL
return 400 with an error naming what is wrong, and no command runs. A valid
request SHALL call `runCommand` once with `{ command, args, options }` and an
`emit` function, answer 200 with `Content-Type: application/x-ndjson` and
`Cache-Control: no-store`, write each emitted `{ stream, text }` as one JSON
line when it is emitted, and end with one line `{ exitCode, error, next }`
holding what `runCommand` resolves. When `runCommand` rejects, the last line
SHALL be `{"exitCode":1,"error":"Error: <message>","next":null}`. Command
requests SHALL not wait for or take the write actions' slot; the runner
orders them.

#### Scenario: Forwarded command streams its output
- **WHEN** a valid `POST /p/osq/api/commands` with body `{"command":"status","args":[],"options":{}}` reaches a runner that emits stdout `a\n`, then stderr `b\n`, and resolves exit code 2, error `x` and next `osq y`
- **THEN** the runner receives that command, args and options, and the response is 200 with exactly the lines `{"stream":"stdout","text":"a\n"}`, `{"stream":"stderr","text":"b\n"}` and `{"exitCode":2,"error":"x","next":"osq y"}`

#### Scenario: Command without proof
- **WHEN** a `POST /p/osq/api/commands` lacks the token, carries a wrong token, lacks `Origin`, carries another site's `Origin`, or is not `application/json`
- **THEN** the server returns 403 with `{"error":"write request refused"}` and does not call the runner

#### Scenario: Bad command body
- **WHEN** a valid `POST /p/osq/api/commands` carries invalid JSON, no `command`, or `args` that is not an array
- **THEN** the server returns 400 and does not call the runner

#### Scenario: Command token
- **WHEN** a client with an allowed host requests `GET /p/osq/api/commands`, and another request carries `Host: evil.example`
- **THEN** the first gets 200 with a 64-character hex `token` that the actions document does not carry, and the second gets 403 with no token

#### Scenario: No runner, no command paths
- **WHEN** a server started with a site and no `runCommand` receives `GET /p/osq/api/commands`, and a server started without a site receives `GET /api/commands`
- **THEN** both return 404 with `{"error":"not found"}`

### Requirement: Change folder files on a server
With a `site` and a `runCommand`, `startWebServer` SHALL serve a change
folder's files under `/p/<project>/api/files/<id>`, through
`src/core/web/web-remote-files.ts`. The change SHALL be resolved with
`findChange` from the change locations module, and SHALL be an active change
in the project's own tree, the first tree `changeTrees` returns, with no
`.run/approved`. A file path is relative to the change folder and
`/`-separated, and its content is UTF-8 text.

`GET api/files/<id>` SHALL use the read guard of `GET api/commands` and
return 200 with `{ folder, files }`: the folder's name, and an object mapping
the path of every file in the folder, except those under `.run/`, to its
text, in sorted path order.

`PUT api/files/<id>` SHALL use the write guard and token of `POST
api/commands`, read a body `{ "files": { "<path>": "<text>" } }`, and replace
the folder's files: afterwards the folder SHALL hold exactly the uploaded
files plus its `.run/` folder unchanged, with no empty folder left behind. It
SHALL return 200 with `{ folder, files }`, `files` being the number of files
written. One upload SHALL run at a time. A refused upload SHALL change no
file and return the status and `{"error":"<error>"}` in the table:

| Case | Status | Error |
|---|---|---|
| A path that is empty, absolute, holds `\` or a NUL, has an empty, `.` or `..` segment, or whose first segment is `.run` | 400 | `path outside the change folder: <path>` |
| A body that is not a JSON object whose `files` maps strings to strings | 400 | `body must be {"files": {"<path>": "<text>"}}` |
| No active change matches `<id>` | 404 | `change <id> not found` |
| The change lives in another tree or has `.run/approved` | 409 | `change <folder> is approved; only an unapproved change's files move` |
| Another upload is running | 409 | `another upload is running` |

`GET api/files/<id>` SHALL answer the 404 and 409 rows the same way. The
selector SHALL be decoded with `decodeChangeSelector`, and an unsafe one SHALL
return 400 with `{"error":"unsafe change selector"}`.

#### Scenario: Download a change folder
- **WHEN** change `001-demo` holds `proposal.md`, `tasks/1.md` and `.run/manifest.json`, and a client requests `GET /p/osq/api/files/001`
- **THEN** the response is 200 with `folder` `001-demo` and `files` holding exactly `proposal.md` and `tasks/1.md` with their text

#### Scenario: Upload replaces the folder
- **WHEN** change `001-demo` holds `proposal.md`, `tasks/1.md` and `.run/manifest.json`, and a valid `PUT /p/osq/api/files/001` uploads `proposal.md` with new text and `tasks/2.md`
- **THEN** the response is 200 with `files` 2, and the folder holds the new `proposal.md`, `tasks/2.md` and the unchanged `.run/manifest.json`, and no `tasks/1.md`

#### Scenario: Upload refused outside the change folder
- **WHEN** a valid `PUT /p/osq/api/files/001` uploads `proposal.md` and one path below
- **THEN** the response is 400 with the error in the table, and no file in the project changes:

| Path | Error |
|---|---|
| `../x.md` | `path outside the change folder: ../x.md` |
| `/etc/x.md` | `path outside the change folder: /etc/x.md` |
| `.run/approved` | `path outside the change folder: .run/approved` |
| `tasks/../../x.md` | `path outside the change folder: tasks/../../x.md` |
| `tasks//1.md` | `path outside the change folder: tasks//1.md` |
| `a\b.md` | `path outside the change folder: a\b.md` |

#### Scenario: Approved change refused
- **WHEN** change `001-demo` has `.run/approved` and a valid `PUT /p/osq/api/files/001` arrives
- **THEN** the response is 409 with `{"error":"change 001-demo is approved; only an unapproved change's files move"}` and no file changes

#### Scenario: Upload without proof
- **WHEN** a `PUT /p/osq/api/files/001` lacks the token
- **THEN** the response is 403 with `{"error":"write request refused"}` and no file changes
