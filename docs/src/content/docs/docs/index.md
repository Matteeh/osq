---
title: What osq is
description: osq turns a short brief into an approved plan, builds it task by task with coding agents, and checks every task itself.
---

osq is a spec-driven software factory. You write a brief: what you want and why. A strong model plans it into a change folder, you approve the plan, and osq hands each small task to a fresh coding agent. An agent saying it is done counts for nothing: osq runs the task's own `verify` command and only a passing run marks it done.

Nothing runs that you didn't approve, and nothing is marked done that osq didn't verify itself.

## The loop

1. **Write a brief.** A few lines on what you want and why, in a Markdown file.
2. **Spec it.** `osq plan <name> --brief <file>` creates a change folder and hands the planning prompt to your planning tool. The plan holds a proposal, the changes to your living capability specs, and small tasks. Each task names the files it may touch and the command that proves it.
3. **Approve.** `osq approve <id>` lints the plan, prints a one-screen digest that flags anything worth a look, and seals it. Nothing runs before this.
4. **Build.** `osq watch` hands each task to a fresh agent. A failed task is retried with the reason, or comes back to you.
5. **Verify and land.** When the last task passes, osq verifies the whole change again, merges its spec changes into the living specs and archives it. With version control on, `osq land <id>` merges it into your default branch.

Run `osq` with no command at any point to see what needs you.

## Where things live

Everything osq knows lives in plain files in your repository:

- `openspec/specs/` holds the living capability specs.
- `openspec/changes/` holds one folder per change: the proposal, the spec changes, and one file per task.
- `.run/` inside each change folder holds the state as marker files, such as `approved`, `done/<n>` and `dead/<n>.md`.
- `decisions/` holds your architecture decision records.

You can read, diff or delete any of it, and the watcher can be stopped and restarted at any time.

## Next

- [Getting started](/docs/getting-started/) sets osq up in your repository and runs a first change.
- [CLI reference](/docs/reference/cli/) lists every command and option.
