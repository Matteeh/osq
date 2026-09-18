---
title: Initial CLI and Project Bootstrap
depends_on: []
features:
  reads: []
---
## Goal

Provide the core CLI framework, configuration loader, and repository scaffolding so osq can be initialized and configured in any project.

## Contract

| Command | Expected Result |
|---|---|
| osq init | Scaffolds osq.config.ts, AGENTS.md, templates, and specs folders |

## Non-goals

- Watcher daemon and execution loop (covered in subsequent specs).
- Task runner and agent process spawning.

## Delta (legacy)

Create features/cli-foundation.md describing the `osq init` and `osq new` commands and configuration resolution.
