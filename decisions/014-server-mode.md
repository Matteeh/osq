---
status: accepted
applies_to: all
rule: Server mode is an addition; an osq server runs the same command functions on its own clone, and every command keeps working locally exactly as today.
---
# 014. Server mode

Date: 2026-10-08

## Status

Accepted

## Context

ADR 006 decision 7 sets the target: osq runs on a server that holds its own
clone, the human decides from an app, there is no human checkout there, and
GitHub is optional. It promises this ADR and keeps local use with a checkout
supported.

What exists to build on:

- Since 142 and 144 every command takes `CommandInputs` (`cwd`, `config`,
  `stdout`, `stderr`) and runs in-process, so a command can run anywhere that
  can hand it writers.
- ADR 009 lets `osq serve` approve, land, reject and retry on loopback through
  the CLI's command functions. ADR 013 proposes configured hosts, so a private
  network such as Tailscale can bring a phone to it.
- ADR 012 runs the watcher under osq's own supervisor, one per project, with
  records under `~/.osq/watch/<hash>/`.
- ADR 007 gives each role only the environment it declares. A planner is not a
  role yet.

On 2026-10-07 and 2026-10-08 the user decided that the server is an addition,
not a replacement, that the first server runs on a private network, that
sign-in waits, and that MCP comes after the server.

## Decision

1. **Server mode is an addition.** Every command, and `osq serve` on loopback,
   keeps working locally exactly as today. Nothing local is removed or
   deprecated. Server mode adds entry points over the same command functions.
2. **The server holds its own clone.** It is an ordinary osq project with no
   human checkout: worktrees under `~/.osq/worktrees/`, watcher records under
   `~/.osq/watch/`, and a default branch that tracks `origin`. Because it is an
   ordinary project, osq run over SSH on the server works as local mode.
3. **Changes come in through the API.** A planner edits a local copy of a
   change folder, and an upload replaces that folder's files on the server.
   The server refuses any path outside `openspec/changes/<id>-<slug>/`, so the
   planner rule "write only inside the change folder" becomes a gate. Lint runs
   on the server against the uploaded folder.
4. **Landed work leaves by a push.** A land on the server does what `osq land`
   does today on its clone, then pushes the default branch to `origin` as a
   fast-forward. If the remote moved, the land stops before pushing and the
   human taps land again. osq never force-pushes. The tap is the command the
   human runs, so ADR 003 holds. Two land modes are named and not built: pushing
   `osq/<id>` for a forge to merge, where a business sign-off is a tap before
   the merge, and a server with no `origin`, where land pushes nothing.
5. **One project per server for now.** Every API path sits under
   `/p/<project>/`, so serving several projects later only adds. The server and
   its watcher run under ADR 012's supervisor.
6. **The CLI reaches a server by forwarding whole commands.** A setting outside
   the committed config names the server. The CLI sends the parsed command; the
   server runs the same command function with writers that stream back as
   NDJSON lines `{stream, text}` and a final `{exitCode, error, next}`; the CLI
   prints them and exits with that code. A forwarded command never prompts and
   behaves as it does without a TTY. `osq plan <id>` downloads the change folder
   to a working copy under `~/.osq/remote/` and starts the planner there;
   `osq lint <id>` uploads that folder, then lints on the server. `init`,
   `setup`, `migrate`, `watch`, `serve` and `doctor` stay local, and aimed at a
   server each says so in one line naming the local alternative.
7. **Planners use the CLI or MCP over the same commands.** Claude Code uses the
   CLI. Claude Desktop and other MCP clients use `osq mcp`, which forwards the
   same way. An MCP tool returns exactly the text the CLI prints. No tool
   approves, lands, rejects or retries. Planning on the server itself, steered
   from the dashboard over the private network or from anywhere once sign-in
   exists, comes later, so no planner role runs on the server yet.
8. **Sign-in is deferred, and the private network is the boundary.** Until
   sign-in exists the server binds only loopback, as ADR 013 says. Anyone who
   reaches it through the private network can tap, including a planner through
   the forwarded CLI; that is the trust local use has today. Sign-in, when it
   comes, is one scheme for the HTTP API, the forwarded CLI and MCP, with a
   human scope that taps and a planner scope that reads, uploads and lints but
   never taps, checked where commands are dispatched. The signed-in name
   becomes `Osq-Approved-By`. Binding beyond loopback needs that sign-in and its
   own ADR.
9. **Credentials stay out of every role.** Push credentials belong to osq's own
   git process, in the server user's git or SSH setup, and no role's
   environment holds them. An executor's model credentials reach it as ADR 007
   declares: an API key through the agent role's environment, or the harness's
   own login in the server user's home. The agent can read that home (ADR 007),
   so on a server a subscription login is readable by the agent; that is
   accepted for a single-user server until a confinement stage changes it.
10. **Every tap view leads with what the human must notice.** It opens with the
    notices osq derives, sorted by severity, with the detail below, and the
    phone width is the first layout. The served dashboard also names the server
    and project it is on and shows what the watcher service is doing.

## Consequences

- One code path serves local use, the server, the forwarded CLI and MCP. Only
  the transport differs, so local and remote output cannot drift.
- `checks` is empty until server code exists. The tests that will enforce this
  ADR: loopback `osq serve` tests passing unchanged, an upload refused outside
  the change folder, a land that stops when `origin` moved, and a forwarded
  command printing the same output and exit code as the local one. The
  `osq-server` and `remote-cli` changes add them and list them in this ADR's
  `checks`.
- Until sign-in exists, the server is only as private as the network in front
  of it.

## Rejected

- **A systemd or launchd unit.** ADR 012 rejected it: it is missing under WSL2
  and gives osq two ways to run one watcher.
- **GitHub-only headless mode as the server mode.** ADR 003's mode B assumes
  labels and PRs, and ADR 006 makes GitHub optional. Forge landing stays a
  named land mode.
- **MCP tap tools.** An agent that can approve or land breaks ADR 006 decision
  2. Approve, land, reject and retry stay with the human.
- **A backend interface inside core** (a local and a remote backend behind
  every reader). Every file reader in core would move behind it, the two
  backends would drift, and local code would change.
- **Planners pushing git branches.** It puts git in front of the planner; ADR
  003 says osq alone writes git.
- **Claude Code on the server over SSH as the way to plan.** It works and
  enforces nothing, so it stays a fallback.
- **OAuth now.** Only MCP served from the server to hosted clients would need
  it.
- **osq terminating TLS.** Tailscale Serve or a reverse proxy does it.
- **A separate publish tap after land.** A second tap that shows no new
  evidence is ceremony.
