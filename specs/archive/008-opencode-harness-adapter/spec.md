---
title: OpenCode harness adapter
depends_on: [007]
features:
  reads: [watcher-and-harness]
  writes: [watcher-and-harness]
---
## Goal

Provide a first-class harness adapter for OpenCode, enabling the osq watcher to execute approved task specs autonomously using opencode run. The adapter manages harness configuration, agent file scaffolding with subagent permissions, argument construction attaching required specification files, process execution under timeout bounds, JSON stream parsing to tokens metrics events, and preflight binary verification.

## Contract

| Command / Component | Expected Output / Behavior |
|---|---|
| osq setup (with harness: "opencode") | Scaffolds .opencode/agent/osq-coder.md with subagent mode, strict permissions, AGENTS.md procedure |
| osq watch (with harness: "opencode") | Verifies opencode --version during preflight, spawns opencode run with --auto, --format json, attaches files, maps events |

## Non-goals

- Interactive TTY mode or planInteractive execution.
- osq plan support or authoring workflows.
- Modifications to agy adapter behavior beyond extracting the shared timeout execution helper.
- Hard OS sandbox confinement or container path-level scope enforcement.

## Delta

Update features/watcher-and-harness.md to document the OpenCode adapter (OpencodeAdapter) implementing HarnessAdapter, configuration options (opencode: bin, model, agent, variant), setup behavior creating .opencode/agent/osq-coder.md with managed blocks and strict tool permissions, spawn invocation arguments and file attachment protocol, stdout event stream parsing to tokens events, and watcher preflight verification.
