## ADDED Requirements

### Requirement: Server setting
The `OSQ_SERVER` environment variable SHALL select an osq server; nothing in
`osq.config.ts` does. `readServerSetting(env)` in
`src/cli/remote-transport.ts` SHALL return null when `OSQ_SERVER` is unset,
empty or only whitespace. Otherwise its trimmed value SHALL be an `http:` or
`https:` URL with no user name, password, query or fragment, whose path is
`/p/<project>` or `/p/<project>/` with `<project>` matching
`^[A-Za-z0-9][A-Za-z0-9._-]*$`, and the function SHALL return
`{ base, host, project }`: `base` is `<origin>/p/<project>/`, and `host` is
the URL's host with its port. Any other value SHALL throw a `CommandError`
with `OSQ_SERVER must look like https://<host>/p/<project>/: <value>`.

`src/cli/remote-transport.ts` SHALL also talk to the server's
`api/commands` and `api/files/<id>` paths, resolved against `base`, with the
global `fetch`. A write first reads the token from `GET api/commands`, then
sends `Origin: <origin of base>`, `Content-Type: application/json` and
`X-Osq-Token`. Its failures SHALL be `CommandError`s with exit code 1:

| Case | Message |
|---|---|
| The request fails before a response | `Could not reach the osq server at <base>: <reason>`, with the reason of the error's `cause` when it has one, else its message |
| A response that is not 2xx | `osq server at <base> refused the request (<status>): <error>`, with the body's `error`, else the status text |
| A command stream that ends without its last line | `osq server at <base> ended the command without an exit code` |

#### Scenario: Server values
- **WHEN** `readServerSetting` reads each `OSQ_SERVER` value below
- **THEN** it returns the result in the table:

| `OSQ_SERVER` | Result |
|---|---|
| unset | null |
| `   ` | null |
| `https://box.tail1234.ts.net/p/osq/` | `{ base: 'https://box.tail1234.ts.net/p/osq/', host: 'box.tail1234.ts.net', project: 'osq' }` |
| `http://127.0.0.1:4174/p/osq` | `{ base: 'http://127.0.0.1:4174/p/osq/', host: '127.0.0.1:4174', project: 'osq' }` |
| `box/p/osq/` | throws `OSQ_SERVER must look like https://<host>/p/<project>/: box/p/osq/` |
| `ftp://box/p/osq/` | throws `OSQ_SERVER must look like https://<host>/p/<project>/: ftp://box/p/osq/` |
| `https://box/osq/` | throws `OSQ_SERVER must look like https://<host>/p/<project>/: https://box/osq/` |
| `https://box/p/osq/?a=1` | throws `OSQ_SERVER must look like https://<host>/p/<project>/: https://box/p/osq/?a=1` |

#### Scenario: Server out of reach
- **WHEN** `OSQ_SERVER` names a loopback port nothing listens on and `osq status` runs
- **THEN** it prints `Could not reach the osq server at <base>: <reason>` on stderr and exits 1

### Requirement: Forwarded commands
When `readServerSetting(process.env)` returns a server, `runCli` SHALL call
`forwardProgram(program, server)` from `src/cli/remote-client.ts` before it
parses, so Commander still parses arguments, validates options and prints
help and the version locally. When it returns null, `runCli` SHALL not touch
the program, and every command SHALL run locally exactly as before.

`forwardProgram` SHALL replace the action of the root command and of each
command below with one that sends `{ command, args, options }` to the server:
`command` is `osq` for the root command and the command's name otherwise,
`args` its positional arguments in order with a missing one as null, and
`options` the command's parsed options. The forwarded commands are `osq`,
`status`, `show`, `report`, `query`, `spec`, `digest`, `graph`, `queue`,
`message`, `approve`, `land`, `reject`, `retry`, `sync`, `new`, `lint` and
`plan`. The action SHALL write each output's text, as it arrives, to the
process stdout or stderr writer it names. When the last line's exit code is
not 0, it SHALL throw a `CommandError` with the line's error or an empty
message, its exit code, and its next step, so `runCli` prints it as it prints
a local failure.

`src/cli/remote-commands.ts` SHALL export `createForwardedCommands(land?)`,
the table the server runs, and `createForwardedRunner(cwd, options?)`, which
builds the server worker's `ForwardedCommandRunner`. Each table entry SHALL
call the command function the CLI action for that command calls, with the
same arguments and options, plus `cwd`, `stdout` and `stderr` writers that
emit the output, and `home` for `osq`, `status` and `report`. It SHALL pass
no `config`, so the command loads the project's config as it does locally.
`approve` SHALL run with `isTerminal` returning false, so it never prompts.
`land` SHALL run as `land(id, { ...inputs, allowStale, publish: true })`, so
a land forwarded to the server pushes to `origin` as a land tapped there
does. `plan` SHALL wrap any error other than a `CommandError` as `Error:
<message>`, as the CLI action does.

The runner SHALL resolve `{ exitCode: 0, error: null, next: null }` when the
command resolves; for a `CommandError`, its exit code, its message or null
when empty, and its next step or null; for any other thrown value, exit code
1, `Error: <message>` and null; and for a command not in the table, exit code
1, `osq <command> does not run on a server` and null. It SHALL never reject,
set `process.exitCode`, or write to a process stream. `approve`, `land`,
`reject`, `retry`, `sync`, `new`, `plan` and `lint` SHALL run one at a time
in the order they arrive, each starting after the one before it ends; every
other command SHALL start at once. The server worker SHALL pass
`startWebServer` a `runCommand` from `createForwardedRunner(cwd, { home })`.

#### Scenario: Same output as local
- **WHEN** each command below runs on a fixture project through a server built with `startWebServer`, a site and `createForwardedRunner`, and again by calling its command function in-process with string writers
- **THEN** both give the same stdout, stderr and exit code:

| Command | Args | Options |
|---|---|---|
| `status` | | |
| `show` | `001` | |
| `spec` | | |
| `query` | | |
| `report` | | `{ json: true }` |
| `lint` | `['001']` | |
| `approve` | `['999']` | |

#### Scenario: Forwarded failure keeps its exit code and next step
- **WHEN** a forwarded command's function throws a `CommandError` with message `Error approving 001:`, exit code 1, and next `osq lint 001`, and another throws `new Error('boom')`
- **THEN** the runner resolves exit code 1 with that message and next, and exit code 1 with `Error: boom` and next null

#### Scenario: Forwarded land publishes
- **WHEN** a runner built on `createForwardedCommands` with a recording land function runs `land` with args `['001']`
- **THEN** the land function is called once for `001` with `publish: true` and the runner's `cwd`

#### Scenario: Writes run one at a time
- **WHEN** a runner receives `approve`, then `retry` and `status` while the `approve` has not ended
- **THEN** `status` starts before `approve` ends, and `retry` starts only after `approve` ends

#### Scenario: Same command from a laptop
- **WHEN** the CLI runs `osq show 001` and `osq spec` with `OSQ_SERVER` set to a server that `osq server start` started over a fixture project, and again without `OSQ_SERVER` in that project
- **THEN** stdout, stderr and the exit code are the same both ways

### Requirement: Commands that stay local
With a server set, `forwardProgram` SHALL make `init`, `setup`, `migrate`,
`watch`, `serve`, `doctor`, `inbox`, and `server` with each of its
subcommands fail before contacting the server, with a `CommandError` whose
message is `osq <name> runs only locally; unset OSQ_SERVER to run it here,
or run it on the server`. `osq plan` with `--session` or `--brief`, and `osq
digest` with `--out`, SHALL fail the same way with `<name>` `plan
--session`, `plan --brief` and `digest --out`.

#### Scenario: Local-only commands name the alternative
- **WHEN** each command below runs with `OSQ_SERVER` set to a server
- **THEN** it prints the line on stderr, exits 1, and the server receives no request:

| Command | Line |
|---|---|
| `osq watch` | `osq watch runs only locally; unset OSQ_SERVER to run it here, or run it on the server` |
| `osq doctor` | `osq doctor runs only locally; unset OSQ_SERVER to run it here, or run it on the server` |
| `osq server start` | `osq server runs only locally; unset OSQ_SERVER to run it here, or run it on the server` |
| `osq plan 001 --session` | `osq plan --session runs only locally; unset OSQ_SERVER to run it here, or run it on the server` |
| `osq digest --out d.md` | `osq digest --out runs only locally; unset OSQ_SERVER to run it here, or run it on the server` |

### Requirement: Planning against a server
A planner working against a server SHALL edit a working copy of the change
folder at `<home>/.osq/remote/<host>/<project>/<folder>/`, with every `:` in
the host replaced by `-` and `<home>` the user's home folder.
`src/cli/remote-plan.ts` SHALL hold the client side.

On the server, a forwarded `plan` without `--next` SHALL run only for an
active change in the project's own tree that holds a `brief.md`; otherwise
it SHALL fail before `planCommand` runs with `osq plan <name> on a server
needs an unapproved change with a brief; queue the brief and run osq plan
--next`.

On the client, a forwarded `plan` with `--print` SHALL print the server's
output unchanged. Without it, the client SHALL collect the stdout; when the
command ends with exit code 0 and one line reads `<path>: ask your planning
tool to plan change <folder> — next: <next>`, it SHALL download the folder
from `api/files/<folder>`, replace the working copy with exactly the
downloaded files, and print that line as `<working copy>: ask your planning
tool to plan change <folder> — next: <next>`. Every other line SHALL be
printed unchanged.

A forwarded `lint` SHALL first upload, for each id it names, the working
copy whose folder name `matchesFolder` matches, with every file in it except
those under `.run/`, through `PUT api/files/<folder>`. When an upload is
refused, the command SHALL fail with the transport's error and lint nothing.
An id with no working copy SHALL be linted as the server holds it, and `lint`
with no ids SHALL upload nothing. Then it SHALL forward `lint` as every other
command is forwarded.

README's "Running osq on a server" section SHALL say how to set
`OSQ_SERVER`, which commands stay local, that `osq plan <id>` downloads the
working copy and `osq lint <id>` uploads it, and that a planner's shell or
editor must be started with `OSQ_SERVER` set.

#### Scenario: Plan downloads a working copy
- **WHEN** the server's change `001-demo` holds `brief.md` and `.run/manifest.json`, and `osq plan 001` runs against it with home `<home>`
- **THEN** `<home>/.osq/remote/<host>/osq/001-demo/` holds the server folder's files, `plan-prompt.md` included and `.run/` left out, and stdout is `<that folder>: ask your planning tool to plan change 001-demo — next: <next>`

#### Scenario: Lint uploads the working copy
- **WHEN** after that plan the working copy's `proposal.md` changes, `tasks/1.md` is deleted and `tasks/2.md` is added, and `osq lint 001` runs
- **THEN** the server's folder holds exactly the working copy's files plus its own `.run/`, and the output is what `osq lint 001` prints on the server for that folder

#### Scenario: Refused upload stops lint
- **WHEN** the server's change `001-demo` has `.run/approved`, a working copy of it exists, and `osq lint 001` runs
- **THEN** it fails with `osq server at <base> refused the request (409): change 001-demo is approved; only an unapproved change's files move`, exits 1, and no lint runs

#### Scenario: Plan without a brief refused
- **WHEN** a forwarded `plan` names `demo`, which matches no change on the server
- **THEN** the runner resolves exit code 1 with `osq plan demo on a server needs an unapproved change with a brief; queue the brief and run osq plan --next`, and `planCommand` is not called
