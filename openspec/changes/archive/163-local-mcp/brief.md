---
queue_item: local-mcp
queue_hash: sha256:60ca6d52063a196e2e81502656cf7806366dc69aa64efc4ce5dfd91e0c2f075e
planner: null
date: 2026-10-09
---

### Goal

`osq mcp` runs an MCP server over stdio with the planning tools only, against a local project or a server. Its write tool refuses any path outside the change folder, so that planner rule becomes a gate. Approve, land, reject and retry are never tools.

### Context

As of 2026-10-07 (Notion: "Server, UI and MCP" options B and D):

- The planner rules "write only inside that change folder" and "never run `osq approve`" are instructions in `PLANNER.md`, not gates.
- `osq plan` hands off through `plan-prompt.md` in the change folder.
- Runtime dependencies are `chokidar`, `yaml`, `commander` and `jiti`; adding one needs an ADR.

### Requirements

- Tools to read the brief, the plan prompt, a requirement (`osq spec`) and history (`osq query`); to write and delete files inside the change folder only; and to run `osq lint` on it.
- Every tool calls the same command functions as the CLI, locally or through the `remote-cli` setting.
- No tool approves, lands, rejects, retries or writes outside the change folder.

### Non-goals

- MCP over HTTP on the server.
- Confining a planner that also has a shell; MCP enforces only what goes through it.

### Notes for planning

- Decide between the MCP SDK (a new dependency, so an ADR) and a small in-house JSON-RPC layer, and say why.
- Try it on a real plan before calling it done; large files through tool calls are the open risk.
