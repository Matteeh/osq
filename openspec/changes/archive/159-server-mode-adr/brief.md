---
queue_item: server-mode-adr
queue_hash: sha256:cd74421e361e0a558e96f18d732af07b900a245e96eef03768dcf331d96ebbf9
planner: null
date: 2026-10-08
---

### Goal

Write the server-mode ADR that ADR 006 decision 7 promises, before any server code. Its rule: server mode is an addition. The CLI and local use with a checkout stay fully supported and maintained, and every command keeps working locally exactly as today.

### Context

As of 2026-10-07 (Notion: "Server, UI and MCP: how the pieces talk (proposal, 2026-10-06)"):

- ADR 006 decision 7: "osq runs on a server that holds its own clone, and the human decides from an app... Server mode gets its own ADR when its brief is written. Local use with a checkout stays supported."
- ADR 009: `osq serve` writes only on loopback (`127.0.0.1`, `SERVE_HOST` in `src/core/web/web-server.ts`), for requests that prove Host, Origin and a per-server token, through the CLI's command functions.
- ADR 012: the watcher runs under osq's own detached supervisor, with records in `~/.osq/watch/<hash>/`, one watcher per project.
- ADR 007: each role gets only the environment it declares.
- Since 142 and 144 every command takes `CommandInputs` (`cwd`, `config`, `stdout`, `stderr`; `src/cli/command-inputs.ts`) and runs in-process.
- The user decided on 2026-10-07: the server is an addition, not a replacement; both stay; MCP comes after the server.

### Requirements

- A new accepted ADR in `decisions/` whose rule says server mode is an addition and local mode stays supported, and which decides:
  - what the server holds: its own clone, how it gets changes from planners, and how landed work leaves it (ADR 003 still holds: osq alone writes git);
  - how the server runs: on 155's supervisor, one project or several;
  - one sign-in scheme for the HTTP API and later MCP, with a human scope that can tap and a planner scope that cannot approve, land, reject or retry;
  - how the CLI reaches a server: forwarding whole commands to the server's command functions, or a backend interface inside core;
  - what the dashboard shows when served remotely.
- The ADR lists what it rejects and why, including systemd units, GitHub-only headless mode and MCP tap tools.
- AGENTS.md's project rules gain the ADR's one-line rule.

### Non-goals

- Any server code. The following queue items build it.
- Removing or changing any local command.

### Notes for planning

- Plan this with the user: they want to design server mode together. Bring each decision as options with a recommendation.
- The ADR's `checks` can be empty until `osq-server` adds tests; say which tests will enforce it.
- Weigh forwarding whole commands: it reuses `CommandInputs` and keeps one code path, but streaming output, exit codes and commands that read local files (`plan`, `lint` on a local draft) need an answer.
