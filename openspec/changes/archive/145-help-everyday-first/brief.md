---
queue_item: help-everyday-first
queue_hash: sha256:7ced739740a713e8c6f7e3e9d7602e9d0ca1c742398ca7958030e2c4fa8fba5b
planner: null
date: 2026-10-03
---

### Goal

`osq --help` lists the everyday commands first and groups the rest, so a new user sees the four-step loop (brief, plan, approve, land) before setup, inspection and plumbing. No command is removed or renamed.

### Context

As of 2026-10-04:

- `osq --help` prints 24 commands in one flat list in registration order: `init`, `new`, `plan`, `lint`, `queue`, `retry`, `reject`, `watch`, `setup`, `migrate`, `status`, `show`, `report`, `digest`, `doctor`, `query`, `serve`, `approve`, `graph`, `inbox`, `land`, `message`, `spec`, `sync`. `approve` and `land` come near the end.
- `src/cli/index.ts` registers 14 of them; `graph`, `spec`, `doctor`, `sync`, `approve`, `query`, `inbox`, `land`, `message` and `digest` register themselves from their own files.
- osq runs commander 13.1.0. Command groups in help (`helpGroup`, `commandsGroup`) arrived in commander 14; 13 offers `configureHelp` and `addHelpText`.
- The ROADMAP page's "A simple surface" principle names the everyday commands as `osq` (what needs me), `plan`, `approve`, `land`, `retry` and `reject`; setup as `init` and `setup`; inspection as `status`, `show`, `report`, `graph`, `serve` and `doctor`; plumbing as `lint`, `new`, `queue` and `migrate`. Commands added since (`digest`, `query`, `spec`, `inbox`, `sync`, `message`, `watch`) need a group.
- `tests/bin-execution.test.ts` asserts every command name appears in `--help`.

### Requirements

- `osq --help` prints the commands in named groups, everyday first. Every command appears exactly once.
- The bare `osq` (the inbox) is described at the top as what to run first.
- Each command's own `--help` is unchanged.
- README's command list follows the same groups.

### Non-goals

- Removing, renaming or hiding any command.
- Changing what any command does.

### Notes for planning

- Say in the proposal which group each command lands in, and why for the ones the roadmap doesn't name.
- Upgrading commander to 14 is a version change of an existing dependency, not a new one; say whether it is worth it or whether `configureHelp` is enough, and measure the fallout of either.
