---
queue_item: slice-registries
queue_hash: sha256:2f654e222aed604ceef50a8b3949411fed1aa0d3c52f7caf3dd28da070d3e680
planner: null
date: 2026-10-10
---

### Goal

A feature adds its config defaults, CLI command, help entry and MCP tools from inside its own slice folder, so two changes to different slices no longer conflict on a shared list.

### Context

As of 2026-10-10:

- `DEFAULT_CONFIG` in `src/core/foundation/config.ts` lists every feature's defaults. `src/cli/index.ts` registers every command. The help groups (`src/cli/help-groups.ts`) and MCP tools (`src/cli/mcp-tools.ts`) are single lists too.
- These files are in cli-foundation, which 22 of the last 30 changes wrote.

### Requirements

- The registration seams follow what `capability-slices-adr` decides.
- `osq --help`, `osq help`, every command's options, `DEFAULT_CONFIG` as merged with `osq.config.ts`, and the MCP tool list are byte-identical before and after.
- Adding a command or a config block needs no edit outside its slice and one generated or static index, if any.
- Config stays the only source of limits and timeouts. No numbers move into code.

### Non-goals

- Moving the existing commands into slices. Each slice's move change does that.

### Notes for planning

- Prefer a static import list that is generated or checked by a test over runtime discovery, so the build and jiti stay simple.
