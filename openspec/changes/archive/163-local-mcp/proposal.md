---
title: osq mcp gives planners tools that write only inside the change folder
depends_on: ["162"]
verify: pnpm verify
features:
  reads: [web-inspection, spec-lint-and-approve, metrics-and-reporting, status-inspection, watcher-and-harness]
---
## Goal

`osq mcp` serves osq's planning tools to an MCP client, such as Claude
Desktop, over stdio. There are nine tools: `plan`, `list_files`, `read_file`,
`write_file`, `edit_file`, `delete_file`, `spec`, `query` and `lint`. The
file tools refuse any path outside one unapproved change folder, so the
planner rule "write only inside that change folder" becomes a gate for
whatever goes through MCP. No tool approves, lands, rejects or retries.

The command tools run the same command functions as the CLI and return
exactly the text the CLI prints. Locally they run through 162's
`createForwardedRunner`. With `OSQ_SERVER` set they run on the server through
162's client: `plan` downloads the working copy, the file tools edit it, and
`lint` uploads it first.

osq speaks MCP itself, in about 150 lines, and ADR 015 records why. The
protocol has two live eras: the `initialize` handshake (2024-11-05 to
2025-11-25), which most clients use today, and the stateless 2026-07-28
revision, with per-request `_meta` and `server/discover`. On 2026-10-09 the
official SDK set `LATEST_PROTOCOL_VERSION = '2025-11-25'` in both its v1
(`@modelcontextprotocol/sdk` 1.32.1, 17 runtime dependencies) and its v2
(`@modelcontextprotocol/server` 2.3.1, which adds `core` and `zod`). So the
SDK would add dependencies without serving the newer era. osq needs only
`initialize`, `ping`, `tools/list`, `tools/call` and `server/discover`.

This builds ADR 014 decision 7.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests cover:

- both protocol eras and every protocol error;
- every path the file tools refuse, symlinks and approved changes included;
- edits;
- a 1,000,000-character file round trip;
- the tools' text against the command functions;
- planning against a real server;
- a pipelined session through the real `osq mcp` binary over stdio;
- ADR 015.

## Non-goals

- MCP over HTTP, on the server or locally.
- Confining a planner that also has a shell or other file tools. MCP enforces
  only what goes through it.
- Approve, land, reject, retry, sync, `new` or `plan --next` as tools. A
  queued change already has its folder and brief, so `plan <change>` covers
  it.
- Planning a steered or approved change through MCP. The file gate allows
  only an unapproved change in the project's own tree, as the server's
  upload does.
- Reading code through MCP. The client's own tools read the code.
- MCP resources, prompts, sampling, elicitation, subscriptions and
  cancellation. The server declares only `tools`.
- Changing any existing command. `osq mcp` is an addition (ADR 014).

## Surface

- Added: `osq mcp` (command), in the "Setup and running" help group
- Added: `osq mcp --cwd <dir>` (flag), the project folder for a client that starts osq elsewhere
- Added: MCP tools `plan`, `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `spec`, `query` and `lint`
- Added: the tool errors `path outside the change folder: <path>`, `no working copy of change <change>; run the plan tool first`, `file not found: <path>`, `<name> must be a string`, `old_text not found in <path>` and `old_text occurs <n> times in <path>`
- Added: README section "Planning through MCP"
- Added: ADR 015 "MCP transport"

## Decisions

- ADR 001: no config key is added; the server comes from `OSQ_SERVER` and the project from `--cwd`.
- ADR 004: unchanged; the `lint` tool runs `lintCommand`, which runs the validator as before.
- ADR 005: unchanged, for the same reason.
- ADR 010: unchanged; MCP does not touch the validator.
- ADR 012: unchanged; `osq mcp` is a foreground process its client starts, not a service.

## Assumptions

- Revised after 162 landed on 2026-10-10: 163 was stacked on 162's first run, and 161 and 162 were rerun from main before they landed. Approval restarts `osq/163-local-mcp` from main and all five tasks run again on the landed server and remote CLI code.
- Every 161 and 162 name the tasks use (the `src/cli/remote-*.ts` files, `src/cli/server.ts`, `server` in `src/cli/help-groups.ts`) exists on main.
- `src/cli/index.ts` is 243 lines on main, so task 4 still moves `parseRejectReason` into `src/cli/reject.ts` to keep it at or under 250.

## Contract

### Requirement: Planning tools only

`osq mcp` SHALL offer only tools that read, write inside one unapproved
change folder, or lint it.

#### Scenario: No tap tools
- **WHEN** an MCP client lists the tools and calls `approve`
- **THEN** the list holds only the nine planning tools and the call fails with `Unknown tool: approve`

### Requirement: Change folder gate

A file tool SHALL refuse any path outside the change folder and change no
file.

#### Scenario: Path outside refused
- **WHEN** `write_file` names `../x.md`
- **THEN** it fails with `path outside the change folder: ../x.md` and no file changes

### Requirement: Same text as the CLI

A command tool SHALL return the text the same CLI command prints.

#### Scenario: Spec through MCP
- **WHEN** the `spec` tool runs with no arguments
- **THEN** its text is what `osq spec` prints

## Human steps

### Before approval

None

### After landing

- Add osq to your MCP client and plan the next queued change through it. For
  Claude Desktop, add `"osq": { "command": "osq", "args": ["mcp", "--cwd",
  "<project>"] }` under `mcpServers` in `claude_desktop_config.json`, with
  `"env": { "OSQ_SERVER": "<url>" }` to plan against a server. The brief
  asks for a trial on a real plan, because the model's ability to send large
  files through tool calls can only be judged in a real client. Put what you
  find in the queue.

## Delta

- `specs/cli-foundation/spec.md`: adds "MCP protocol", "MCP file tools",
  "MCP planning tools", "MCP command" and "MCP transport decision".

Five tasks, in order. Task 1 adds the protocol handler. Task 2 adds the file
tools and their gate. Task 3 adds the tool table and runs the command tools
locally and against a server. Task 4 adds the `osq mcp` command, its stdio
loop, the help group, and the README. Task 5 writes ADR 015 and links it in
the decisions index. No file is shared between tasks.

## Background

**Why the forwarded runner locally.** `createForwardedRunner` already calls
each command function with string writers, catches every failure as an exit
code, and refuses a `plan` for a change with no brief. That refusal matters:
`planCommand` would otherwise create a change and read a brief from stdin,
and stdin is the MCP channel. Its refusal line says "on a server", and the
tool returns it as is.

**Why tool calls run one at a time.** A rough cut that ran pipelined calls at
once returned `read_file` and `delete_file` before the `write_file` sent
ahead of them. Clients can pipeline, so `tools/call` keeps arrival order.

**Measured on 2026-10-09** in a scratch worktree at `osq/162-remote-cli`
(6555dfdf) with a rough cut of every code task. The CLI typecheck and build
passed. Over stdio, the built binary answered `initialize` (2025-06-18),
`server/discover` (2026-07-28), `tools/list`, `spec`, `query`, `lint` and
`plan` on a copy of this change. It refused `../x.md` and an `approve` call,
and round-tripped a 1,000,005-byte file in about 5 seconds for the whole
session. In the full suite, only `tests/help-groups.test.ts` (which pins the
groups; task 4 owns it) and `tests/readme-command-groups.test.ts` (which
passes once README names `osq mcp`) failed. `src/cli/index.ts` was at 249
lines, and moving `parseRejectReason` into `reject.ts` brought it to 244 with
the new registration. Biome rejects an assignment inside an expression,
which the stdio queue must avoid. The server's upload has no body limit, so
large files reach the server unchanged.
