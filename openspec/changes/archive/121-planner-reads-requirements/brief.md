---
queue_item: planner-reads-requirements
queue_hash: sha256:b4bc9fcbe41d5dbe222603b5a7b34b9807343fc22314e4509ca3984e8e022141
planner: null
date: 2026-09-30
---

### Goal

The planner and executor instructions ask for the requirements a change touches, and osq prints one requirement on request, so no agent has to read a whole living spec.

### Context

- The living specs total about 600 KB. watcher-and-harness is 153 KB, cli-foundation 130 KB, spec-lint-and-approve 85 KB.
- `PLANNER.md` (managed block from `src/core/foundation/init-blocks.ts`) says "Read `AGENTS.md`, the capability specs this change touches, and one recent archived change end to end." A literal planner reads 200 KB or more for a change touching two capabilities.
- The executor protocol says "Read your task file, its parent `proposal.md`, then only the delta specs and capability specs it names." A task that names cli-foundation sends a cheap executor through 130 KB.
- A careful planner already greps for the requirements it needs. The instructions should say so, and osq should make it one command.
- `parseCapabilitySpec` already splits a living spec into requirements.

### Requirements

- A command prints one requirement of a living capability spec, with its scenarios, by capability and requirement name. With a capability alone it lists the requirement names. An unknown capability or requirement fails naming it. The planner picks the command's name and flags; `osq spec <capability> [requirement]` is one option.
- The planner instructions ask for the requirements the change touches, found with that command, instead of whole capability specs.
- The executor protocol asks for the requirements the task names.
- The `osq plan` prompt says the same.

### Non-goals

- Splitting or shortening the living specs.
- Changing what tasks or proposals must name.

### Notes for planning

- Both managed blocks change. Tests pin their text, and `osq doctor` checks the managed blocks; measure in a scratch worktree.
- `templates/PLANNER.md` and this repository's `PLANNER.md` and `AGENTS.md` carry the blocks.
