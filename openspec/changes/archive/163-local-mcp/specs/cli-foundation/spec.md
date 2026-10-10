## ADDED Requirements

### Requirement: MCP protocol
`createMcpHandler(tools, info)` in `src/cli/mcp-protocol.ts` SHALL answer
one parsed JSON-RPC 2.0 message from an MCP client, with no MCP SDK and no
I/O of its own. `info` holds the server's `name`, `version` and
`instructions`; each tool has a `name`, a `description`, an `inputSchema`
and a `run(args)` that resolves `{ text, isError }`.

It SHALL serve both eras of the protocol. A request whose `params._meta`
holds `io.modelcontextprotocol/protocolVersion` is modern: that version
SHALL be `2026-07-28`, its `_meta` SHALL also hold
`io.modelcontextprotocol/clientCapabilities`, and its result SHALL carry
`resultType: 'complete'` and `_meta` with
`io.modelcontextprotocol/serverInfo` `{ name, version }`. Any other request
is legacy, with or without an `initialize` before it, and its result SHALL
carry neither. The legacy versions are `2025-11-25`, `2025-06-18`,
`2025-03-26` and `2024-11-05`.

A message without a `method`, or with one and no `id`, SHALL get no answer.
A tool that throws SHALL give `{ text: 'Error: <message>\n', isError: true }`.
A `tools/call` result SHALL be `{ content: [{ type: 'text', text }], isError }`
with the tool's text and flag. The handler SHALL never reject.

#### Scenario: Requests and answers
- **WHEN** the handler built with the nine planning tools and `{ name: 'osq', version: '1.2.3', instructions: 'I' }` answers each message below
- **THEN** it answers as the table says:

| Message | Answer |
|---|---|
| `initialize` with `protocolVersion: '2025-06-18'` | result `{ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'osq', version: '1.2.3' }, instructions: 'I' }` |
| `initialize` with `protocolVersion: '1999-01-01'` | result with `protocolVersion: '2025-11-25'` |
| `ping` | result `{}` |
| `tools/list` | result `{ tools }`, the nine tools' `name`, `description` and `inputSchema` in order |
| `server/discover` with `_meta` version `2026-07-28` and `clientCapabilities: {}` | result `{ resultType: 'complete', supportedVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'], capabilities: { tools: {} }, instructions: 'I', _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'osq', version: '1.2.3' } } }` |
| `tools/list` with `_meta` version `2026-07-28` and `clientCapabilities: {}` | result with `resultType: 'complete'`, the nine tools, and that `_meta` |
| `tools/list` with `_meta` version `2030-01-01` | error `{ code: -32022, message: 'Unsupported protocol version', data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'], requested: '2030-01-01' } }` |
| `tools/list` with `_meta` version `2026-07-28` and no `clientCapabilities` | error with code `-32602` |
| `tools/call` named `approve` | error `{ code: -32602, message: 'Unknown tool: approve' }` |
| `resources/list` | error `{ code: -32601, message: 'Method not found: resources/list' }` |
| `notifications/initialized` with no `id` | no answer |

#### Scenario: A throwing tool
- **WHEN** `tools/call` runs a tool whose `run` throws `new Error('boom')`
- **THEN** the result is `{ content: [{ type: 'text', text: 'Error: boom\n' }], isError: true }`

### Requirement: MCP file tools
`src/cli/mcp-files.ts` SHALL hold `list_files`, `read_file`, `write_file`,
`edit_file` and `delete_file`. Each takes a `change` and works in that
change's folder only. A planner can still write elsewhere through other
tools its client gives it; these tools refuse to.

Locally, the folder SHALL be the one `resolveRemoteChange` from
`src/core/web/web-remote-files.ts` resolves in the project: an active
change in the project's own tree with no `.run/approved`; when it refuses,
the tool SHALL fail with its error. Against a server, the folder SHALL be the
working copy under `remoteWorkRoot(server, home)` whose name `matchesFolder`
matches; with none, the tool SHALL fail with `no working copy of change
<change>; run the plan tool first`.

A `path` SHALL pass `isSafeUploadPath`, and the deepest part of it that
exists SHALL resolve, through symlinks, inside the folder; otherwise the
tool SHALL fail with `path outside the change folder: <path>` and change no
file. A missing file SHALL fail with `file not found: <path>`, and a
missing or non-string argument with `<name> must be a string`. Each
failure's text ends with a newline.

`list_files` SHALL give one path per line, `/`-separated and sorted, for
every file `readChangeFiles` reads, so `.run/` never shows. `read_file`
SHALL give the file's text unchanged. `write_file` SHALL create missing
folders, write `text` as UTF-8 and give `wrote <path> (<bytes> bytes)`.
`edit_file` SHALL replace `old_text` with `new_text` when `old_text` occurs
exactly once and give `edited <path>`; otherwise it SHALL fail with
`old_text not found in <path>` or `old_text occurs <n> times in <path>` and
change nothing. `delete_file` SHALL remove one file and give `deleted
<path>`.

#### Scenario: Paths outside the change folder refused
- **WHEN** `write_file` on change `001` of a project gets each path below, with `escape` a symlink in the folder to a folder outside it
- **THEN** it fails with `path outside the change folder: <path>` and no file outside or inside the folder changes:

| Path |
|---|
| `../x.md` |
| `/tmp/x.md` |
| `tasks/../../x.md` |
| `.run/approved` |
| `a\b.md` |
| `escape/x.md` |

#### Scenario: Approved change refused
- **WHEN** change `001-demo` has `.run/approved` and `write_file` names `001` with path `proposal.md`
- **THEN** it fails with `change 001-demo is approved; only an unapproved change's files move` and `proposal.md` is unchanged

#### Scenario: Edits
- **WHEN** `proposal.md` holds `a b b` and `edit_file` runs with each `old_text` below and `new_text` `c`
- **THEN** it gives the result in the table:

| `old_text` | Result | `proposal.md` after |
|---|---|---|
| `a` | `edited proposal.md` | `c b b` |
| `z` | fails `old_text not found in proposal.md` | `a b b` |
| `b` | fails `old_text occurs 2 times in proposal.md` | `a b b` |

#### Scenario: Files round trip
- **WHEN** `write_file` writes `tasks/2.md` with 1,000,000 characters, `list_files` and `read_file` run, then `delete_file` removes it
- **THEN** `list_files` names `tasks/2.md` and no `.run/` path, `read_file` gives the same text, and after the delete `read_file` fails with `file not found: tasks/2.md`

### Requirement: MCP planning tools
`createMcpTools(target)` in `src/cli/mcp-tools.ts` SHALL give exactly these
tools in this order, and none other. `target` is `{ kind: 'local', cwd }` or
`{ kind: 'remote', server, home? }`.

| Tool | Arguments | Runs |
|---|---|---|
| `plan` | `change` | `osq plan <change>` |
| `list_files` | `change` | "MCP file tools" |
| `read_file` | `change`, `path` | "MCP file tools" |
| `write_file` | `change`, `path`, `text` | "MCP file tools" |
| `edit_file` | `change`, `path`, `old_text`, `new_text` | "MCP file tools" |
| `delete_file` | `change`, `path` | "MCP file tools" |
| `spec` | `capability?`, `requirement?` | `osq spec [capability] [requirement]` |
| `query` | `select?` | `osq query [select]` |
| `lint` | `change` | `osq lint <change>` |

Each `inputSchema` SHALL be a JSON Schema object listing the arguments as
strings, the ones without `?` required, with `additionalProperties: false`.
No tool SHALL approve, land, reject, retry, sync, or write outside one
change folder.

A command tool SHALL send `{ command, args, options: {} }`, with a missing
argument as null. Locally it SHALL run through `createForwardedRunner(cwd)`
from `src/cli/remote-commands.ts`, so it calls the command function the CLI
calls, and `plan` keeps that runner's refusal of a change with no brief.
Against a server, `plan` SHALL run through `planOnServer`, which replaces
the working copy, `lint` through `lintOnServer`, which uploads it first, and
the others through `runOnServer`, each with `home`. The tool's text SHALL be
every stdout and stderr chunk in the order they arrived, then, when the
command fails, its error and a newline when it has one and `Next: <next>`
and a newline when it has a next step, as `runCli` prints them. `isError`
SHALL be true exactly when the exit code is not 0.

#### Scenario: Tools give the CLI's text
- **WHEN** each tool below runs locally on a fixture project with change `001-demo`, and the same command runs by calling its command function with string writers
- **THEN** the tool's text is that stdout and stderr in arrival order, and `isError` is true exactly when the command failed:

| Tool | Arguments | Command |
|---|---|---|
| `spec` | `{}` | `osq spec` |
| `query` | `{}` | `osq query` |
| `lint` | `{ change: '001' }` | `osq lint 001` |

#### Scenario: Plan prepares the prompt
- **WHEN** the `plan` tool runs locally for change `001`, which holds `brief.md`
- **THEN** its text is `<folder>: ask your planning tool to plan change 001-demo — next: <next>` and a newline, and the folder holds `plan-prompt.md`

#### Scenario: Planning against a server
- **WHEN** the tools target a server built with `startWebServer`, a site and `createForwardedRunner` over a fixture project whose change `001-demo` holds `brief.md`, and `plan`, `write_file` of `tasks/2.md`, and `lint` run for `001` with home `<home>`
- **THEN** `plan` fills `<home>/.osq/remote/<host>/osq/001-demo/`, `write_file` writes there, and after `lint` the server's folder holds `tasks/2.md` and the lint text is what `osq lint 001` prints on the server

#### Scenario: No tap tools
- **WHEN** the tool names are read
- **THEN** they are exactly `plan`, `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `spec`, `query` and `lint`

### Requirement: MCP command
The CLI SHALL provide `osq mcp`, registered by `registerMcpCommand` in
`src/cli/mcp.ts`, in the "Setup and running" help group after `server`, and
README's command list SHALL name it. It SHALL serve the planning tools to an
MCP client over stdio: one JSON-RPC message per line in, each answer as one
line of JSON out, and nothing else on stdout. `--cwd <dir>` SHALL name the
project folder, resolved to an absolute path, and default to the process
folder. When `readServerSetting(process.env)` returns a server, the tools
SHALL target it; otherwise they target the project. `forwardProgram` SHALL
leave `mcp` alone, so it runs on the planner's machine either way.

A line that is not JSON SHALL get `{ jsonrpc: '2.0', id: null, error: {
code: -32700, message: 'Parse error' } }`. `tools/call` requests SHALL run
one at a time in the order they arrive; every other request SHALL be
answered at once. When stdin ends, the command SHALL answer every request
it has read and exit 0. The instructions SHALL tell the client to run
`plan`, read `plan-prompt.md` and follow it, write only inside the change
folder, run `lint` until it passes, and leave approval to a human.

README SHALL have a "Planning through MCP" section that shows an MCP client
configuration running `osq mcp --cwd <project>`, says to add `OSQ_SERVER`
to its environment to plan against a server, lists the tools, and says that
approve, land, reject and retry are not tools.

#### Scenario: A planning session over stdio
- **WHEN** the CLI, spawned from `src/cli/bin.ts`, runs `osq mcp --cwd <project>` for a temporary project with change `001-demo` holding `brief.md`, receives `initialize`, `notifications/initialized`, `tools/list`, then `tools/call` for `plan`, `write_file` of `tasks/1.md`, `read_file` of `tasks/1.md`, `write_file` of `../x.md` and `lint`, all written before any answer, and stdin closes
- **THEN** every stdout line parses as JSON, each request gets one answer with its id, `read_file` gives the text `write_file` wrote, `../x.md` fails with `path outside the change folder: ../x.md`, `plan-prompt.md` exists, and the command exits 0

#### Scenario: Not JSON
- **WHEN** `osq mcp` receives the line `not json` and stdin closes
- **THEN** it writes the parse error line and exits 0

### Requirement: MCP transport decision
osq's decisions SHALL include an accepted ADR 015 that applies to
`cli-foundation`, whose rule is "osq mcp speaks MCP over stdio itself in
both protocol eras, with no SDK, and its tools write only inside one
unapproved change folder.", whose `checks` are
`tests/mcp-protocol.test.ts`, `tests/mcp-files.test.ts`,
`tests/mcp-tools.test.ts` and `tests/mcp-cli.test.ts`, and which names the
MCP SDK in its Rejected section with when to revisit it. osq's
`decisions/README.md` index SHALL link it once.

#### Scenario: Transport decision recorded
- **WHEN** osq's decisions folder is read and validated against its living specs
- **THEN** ADR 015 is accepted for `cli-foundation` with that rule and those four checks, validation reports no error and no warning, and the index links `015-mcp-transport.md` once
