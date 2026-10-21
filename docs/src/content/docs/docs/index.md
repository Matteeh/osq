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

## What you get

- **Approval before anything runs.** Every plan waits for you. Before you approve, osq shows the goal, each task, and flags like a shared file or a removed requirement.
- **Tests decide, not the agent.** osq runs each task's tests in its own process after the agent exits. Only a pass marks the task done, and the whole change must stay green after every task.
- **Agents stay in their lane.** Each task lists the files it may change. An agent that edits anything else, touches git, or quietly changes a test fails the task.
- **Retries that learn.** A failed task gets one more try with the exact failure in its prompt. If it fails the same way twice, osq stops and asks you to adjust the plan.
- **Each change on its own branch.** Changes run in their own git worktree. When you're happy, `osq land` merges it into your default branch. osq never rewrites history.
- **Approve from your phone.** Run osq on a server with `osq server start` and it keeps working while you're away. A dashboard shows what needs you, and approve, retry and land are one tap.
- **Specs that stay true.** Your project keeps living specs of what it does. They only change when an approved change lands, so they always describe the code you have.
- **A full audit trail.** Every spawn, test run, retry and decision is an append-only file in your repo. `osq report` and `osq query` answer why a task failed last month.
- **A second opinion.** An optional reviewer on a different model checks the finished change against its specs before it lands.
- **Bring your own agent.** osq drives Claude Code, Codex CLI, OpenCode, Pi or Antigravity. Swap it per project in one line of config.

## Coming in the rebuild

osq is being rebuilt as a fast single binary. These land with it:

- **Many changes at once.** A queue that runs as many agents as there is ready work, and explains why anything is waiting.
- **Agents set up in a UI.** Pick the agent and model for each role, from planner to reviewer, without editing config by hand.
- **Spend limits.** Hard caps per agent, model and day, so a runaway task can't eat your budget.
- **Choose how much is automatic.** Decide per step whether you approve, approve only when green, or let osq go ahead. Core checks stay on.
- **One install.** A single download with no Node.js needed, for laptops and servers alike.
- **Self-improving process.** osq studies its own history and proposes better plans and checks, always as a change you approve.

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
