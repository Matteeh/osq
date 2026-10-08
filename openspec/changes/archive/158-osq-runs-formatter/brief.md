---
queue_item: osq-runs-formatter
queue_hash: sha256:e99a184dbf1c9e2ead3e3ea2f040c7841e40602e5444147cb018d84ba40dfed7
planner: null
date: 2026-10-07
---

### Goal

osq runs the project's formatter on the files a task changed before it runs verify, so a formatting-only diff can never kill a task. Formatting has one correct result, so under ADR 006 it is osq's step, not the agent's.

### Context

As of 2026-10-07 (Notion: "Why 155 task 2 died" candidates 2 and 3):

- 155 task 2's second attempt passed all 3,441 tests and failed only `biome check` on line wrapping in two files. With two different death reasons, the change halted, and a human ran `osq retry 155 2`.
- This repository's `package.json` has `format` (`biome format --write src tests packages/ui/src`) and `lint` (`biome check ...`), and `verify` ends with `pnpm lint`.
- Gate commands live in config under `gates` (`src/core/foundation/config-gates.ts`, for example `baselineVerify`). `osq.config.ts` sets none for formatting.
- The executor's `Touched:` line is the agent's claim. osq knows the task's real changes from git in the worktree.

### Requirements

- A config key holds a format command that takes the files to format. With no key set, nothing changes.
- After the executor exits and before the task's verify, osq runs that command on the task's changed files that still exist, and the formatted files become part of the task's result.
- A failing format command is recorded and does not kill the task by itself; verify still decides.
- `osq init` mentions the key, and this repository sets it.

### Non-goals

- Fixing lint findings other than formatting.
- Formatting files outside the task's changes.

### Notes for planning

- Formatting must not change a file outside the task's scope, or the scope audit fires. Format only scoped files and say so.
- Check how a formatted file interacts with the scope hashes done tasks record.
