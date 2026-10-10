---
status: accepted
applies_to: [cli-foundation]
rule: osq mcp speaks MCP over stdio itself in both protocol eras, with no SDK, and its tools write only inside one unapproved change folder.
checks:
  - tests/mcp-protocol.test.ts
  - tests/mcp-files.test.ts
  - tests/mcp-tools.test.ts
  - tests/mcp-cli.test.ts
---
# 015. MCP transport

Date: 2026-10-09

## Status

Accepted

## Context

ADR 014 decision 7 gives MCP clients `osq mcp`: Claude Desktop and other MCP
clients reach osq through it, forwarding the same commands the CLI runs, and
no tool approves, lands, rejects or retries. It promises this ADR for the
transport itself.

The protocol has two live eras. Most clients today still speak the
`initialize` handshake, whose revisions run from `2024-11-05` to
`2025-11-25`. The `2026-07-28` revision is stateless: each request carries
its protocol version and client capabilities in `params._meta`, and a client
discovers the server with `server/discover` rather than an `initialize`.

On 2026-10-09 the official SDK's `LATEST_PROTOCOL_VERSION` was
`2025-11-25` in both lines. Its v1, `@modelcontextprotocol/sdk` 1.32.1,
brought 17 runtime dependencies, express, hono, jose and zod among them. Its
v2, `@modelcontextprotocol/server` 2.3.1, added
`@modelcontextprotocol/core` and zod. So the SDK would add dependencies
without serving the newer era, and osq needs only `initialize`, `ping`,
`tools/list`, `tools/call` and `server/discover`.

## Decision

1. **osq speaks newline-delimited JSON-RPC over stdio itself, in both eras.**
   It answers only `initialize`, `ping`, `tools/list`, `tools/call` and
   `server/discover`. No SDK is a dependency.
2. **The tools are only** `plan`, `list_files`, `read_file`, `write_file`,
   `edit_file`, `delete_file`, `spec`, `query` and `lint`. The file tools
   stay inside one unapproved change folder, or its working copy against a
   server.
3. **Command tools return exactly the CLI's text** through 162's forwarded
   runner locally or its client against a server, so local and remote output
   cannot drift.
4. **`tools/call` runs one at a time in arrival order.** Clients can pipeline
   calls, and a reordered write or delete would be seen.

## Consequences

- The transport is about 150 lines in `src/cli/mcp-protocol.ts`, with no
  dependency added and both eras served as they exist today.
- A new protocol revision is ours to add, and the file tools' gate is the
  only place a path is judged.
- MCP serves tools only: resources, prompts, sampling, elicitation,
  subscriptions and cancellation stay unimplemented.

## Rejected

- **The MCP SDK**, `@modelcontextprotocol/sdk` and
  `@modelcontextprotocol/server`. Revisit it when osq takes `zod` as a
  dependency for another reason, or when the SDK serves the `2026-07-28`
  era. Then only `src/cli/mcp-protocol.ts` would change.
- **MCP over HTTP.** ADR 014 rejects OAuth for now, and a loopback stdio
  bridge matches every client osq targets.
- **Approve, land, reject and retry as tools.** ADR 014 decision 7 keeps the
  taps with the human, and an agent that can approve or land breaks ADR 006
  decision 2.
