---
queue_item: safer-harness-defaults
queue_hash: sha256:d01a9c44d788f627442f372defc38bb41978d05b4a871fb6fc169106b0091306
planner: null
date: 2026-10-02
---

### Goal

`osq init` and `DEFAULT_CONFIG` no longer give a new project an agent with its permissions switched off, and `osq doctor` says how each harness confines its agent. This is the last open item of milestone M1.

### Context

As of 2026-10-02:

- `DEFAULT_CONFIG` in `src/core/foundation/config.ts` sets `agy.dangerouslySkipPermissions: true`, and `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'agy'` (`src/core/foundation/init.ts`). A fresh project therefore runs agents with every permission prompt bypassed.
- Change 122 wrote ADR 007 (role environments) and added Claude and opencode denials for git, network tools and sudo. Its brief split off this follow-up: the `osq init` harness default, agy's permission bypass, and the `osq doctor` containment report.
- `osq doctor` has a `harness-containment` check only for Claude Code (`src/core/foundation/config-claude.ts`).
- Still open from the to-do page: does agy work headless without the bypass flag? Check before choosing its default.

### Requirements

- A project that never sets `agy.dangerouslySkipPermissions` does not run agy with the bypass. If agy cannot run headless without it, `osq init` stops scaffolding agy as the default harness instead, and the proposal says which harness it picks and why.
- `osq doctor` reports a `harness-containment` line for every harness: what confines its agent, and a warning when the configured settings bypass it.
- A project that sets the bypass explicitly keeps working, and `osq doctor` warns about it.
- README's harness sections and the Upgrading notes say what changed.

### Non-goals

- Containers or any confinement stage after ADR 007's stage 1.
- Changing role environments.

### Notes for planning

- ADR 007 governs this. Say whether this change stays inside it or needs a revision.
- Changing a default is a consumer-visible change; list it in Surface.
