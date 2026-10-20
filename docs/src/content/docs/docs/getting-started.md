---
title: Getting started
description: Install osq in your repository, plan a first change, approve it and let the watcher build it.
---

## Before you start

- **Node.js 24 or newer.**
- **A coding agent osq can drive:** Claude Code, Codex CLI, OpenCode, Pi or Antigravity. `harness` in `osq.config.ts`, or `OSQ_HARNESS`, picks which one runs your tasks.
- **A repository with a test command.** osq judges every task by a command that exits 0, so it needs something to run.

## 1. Set up osq

```sh
npx @matteeh/osq init
pnpm add -D @matteeh/osq
```

`init` adds the `openspec/` and `decisions/` folders, `osq.config.ts`, `.env.example`, a managed block in `AGENTS.md`, `PLANNER.md`, and a Claude Code planning command. It is safe to run again: after an upgrade it refreshes only its own managed blocks.

Then answer and accept `decisions/000-how-this-project-is-built.md`, the starter decision record `init` writes. Accepted decision records become project rules in `AGENTS.md`, which every agent reads, so this is where you tell them how the project is built.

Run `osq doctor` to check the setup, including that your coding agent is available.

## 2. Write a brief

A brief is a Markdown file with what you want and why. It can be a business goal in plain words or a ticket copied from your backlog:

```md title="brief.md"
Customers can cancel an order until it ships.
Cancelling refunds the payment and puts the stock back.
Support keeps asking for this, and refunds are done by hand today.
```

## 3. Plan it

```sh
pnpm osq plan order-cancellation --brief brief.md
```

osq creates the change folder, writes the complete planning prompt to `plan-prompt.md` inside it, and prints which folder to hand to your planning tool. In Claude Code, `init` installed `/osq-plan`, which takes the change's name. Tools that read `AGENTS.md` find their instructions there.

The planner writes a proposal, the changes to your capability specs, and small tasks. It runs `osq lint` until the plan is clean, and it never approves.

## 4. Review and approve

```sh
pnpm osq approve 042
```

Approval lints the change again, prints a digest with one line per task and any flags worth a look, then seals the plan. Nothing runs before you approve.

## 5. Build it

```sh
pnpm osq watch
```

The watcher hands each task to a fresh agent, then runs the task's `verify` itself. A failed task is retried with the reason it failed, or comes back to you. When every task passes, it verifies the whole change again, merges the spec changes into `openspec/specs/` and archives the change.

## 6. See what needs you, then land it

```sh
pnpm osq
pnpm osq land 042
```

`osq` with no command prints the inbox: what needs you, what is running and what landed since you last looked. `osq land` merges an archived change into your default branch and needs version control turned on with `vcs.enabled` in `osq.config.ts`. With it off, osq makes no git writes and you commit the change yourself.

## Next

- [CLI reference](/docs/reference/cli/) lists every command and option.
- The [README on GitHub](https://github.com/Matteeh/osq#readme) covers configuration, gates, harnesses and version control in full.
