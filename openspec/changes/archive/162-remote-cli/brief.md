---
queue_item: remote-cli
queue_hash: sha256:e662a3cb9229777cc3a0c0e8f8618fac4515af60f0a2d6a531dbdb4bb9d51634
planner: null
date: 2026-10-09
---

### Goal

The same `osq` binary can point at an osq server, and its commands then act on the server's project. With no server configured, every command works locally exactly as today.

### Context

As of 2026-10-07:

- Every command takes `CommandInputs` and runs in-process (`src/cli/command-inputs.ts`, `resolveInputs`); `src/cli/` has about 25 command functions.
- `server-mode-adr` decides between forwarding whole commands and a backend interface inside core.

### Requirements

- A setting outside the repository's committed config (so one checkout can use either mode) selects a server and its sign-in.
- Read commands (`osq`, `status`, `show`, `report`, `query`, `spec`) and the human taps work against the server with the same output as locally.
- A planner can write a change's files to the server and run lint there, as the ADR decides.
- With no server set, nothing changes, and the local tests pass unchanged.
- A command that cannot work remotely says so in one line, naming the local alternative.

### Non-goals

- Removing or deprecating any local path.
- MCP; that is `local-mcp`.
