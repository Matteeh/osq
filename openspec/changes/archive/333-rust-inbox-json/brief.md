---
queue_item: rust-inbox-json
queue_hash: sha256:e7e907751ac2de79301ed628c03269ffc266602502a8c488746c893cc933a8b6
planner: null
date: 2026-10-24
---

### Goal

The dashboard and scripts read the inbox as JSON. Rust `osq inbox` prints the text view only. Port `--json`.

### Context

As of 2026-10-24:

- TypeScript: `src/cli/inbox.ts` prints `JSON.stringify(inbox, null, 2)` of the same inbox model the text view renders, and `osq --json` with no command does the same.
- Rust `crates/features/inbox` builds every card type TypeScript has (needs-you, running, landed, archived, paused, after-land, autopilot stop, validator failing).

### Requirements

- Rust `osq inbox --json` prints TypeScript's JSON byte for byte for every card type, and writes the same look cursor as the text view does.
- Bare `osq --json` gives the same output when the CLI already passes the flag to the inbox command; otherwise that is left for later.
- Tests compare with TypeScript's `dist` on the inbox crate's fixtures.

### Non-goals

- `--follow`; it needs the loop.
