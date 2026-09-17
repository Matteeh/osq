# osq

Strict spec queue. Spec-driven development with two kinds of agent and a human gate between them.

A smart model helps you write small, immutable task specs. A watcher hands each approved spec to a fresh, cheap coding agent that does the work, writes a result, and exits. Failures go to a dead letter queue you deal with next time you sit down. Nothing runs that you didn't approve, and nothing is marked done that the watcher didn't verify itself.

If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.

## Install

```sh
npx osq init          # scaffolds the folders below and configuration
pnpm add -D osq       # adds osq as a devDependency (or npm i -D osq)
pnpm osq watch        # start the watcher
```

`init` is idempotent. Run it again after upgrading to refresh the managed block in AGENTS.md; it never touches anything else you've edited.

## What it puts in your repo

```
AGENTS.md          your existing file, plus a managed block with the coding agent procedure
osq.config.ts     limits, paths, max concurrency
specs/
  _template/       copied by `osq new`
  042-order-cancellation/
    spec.md        goal, contract, non-goals, and the delta to apply to feature docs
    tasks.md       one checkbox per task, ticked by the watcher
    tasks/1.md     the unit of work: acceptance, verify, scope, entry
    tasks/2.md
    .run/          approved (hash), running/, done/, dead/, results/, events/
  archive/         finished change folders, moved whole
features/          one doc per feature, describes current behavior, always true of main
decisions/         ADRs, superseded not edited
.env.example       OSQ_HARNESS and API keys
```

A change folder is a feature. A task is one unit of work for one agent. After approval the folder is read-only until every task is done or one is dead. State is which marker files exist under `.run/`, never a field in a document.

## The loop

```
you + smart model   write change folder  ->  specs/042-x/ with spec.md and tasks/
you                 approve              ->  .run/approved
watcher             spawn per task       ->  cheap agent, fresh context, one attempt
agent               work, write result   ->  .run/results/1.md, exit
watcher             verify, tick box     ->  .run/done/1  or  .run/dead/1.md
watcher             last task done       ->  apply delta to features/, archive folder
you                 next time            ->  osq status, look at dead
```

Smart models author specs and never execute them. Cheap models execute specs and never author them.

## Change folder

`spec.md` is written for humans and the smart model:

```yaml
---
title: Order cancellation
depends_on: [041]
features:
  reads: [inventory-reservation]
  writes: [order-state-machine]
---
## Goal
## Contract
## Non-goals
## Delta
What changes in each doc under features.writes. Applied by the watcher when the last task is done.
```

`tasks/<n>.md` is what a coding agent gets:

```yaml
---
title: When a PENDING order is cancelled, its reservation is released
verify: pnpm test -- orders/cancel
scope: [src/orders/**, tests/orders/**]
entry: [src/orders/service.ts]
skills: []
---
## Acceptance
- [ ] each line is a test in disguise, max 7
```

Tasks run in order. The agent reads its task, the parent `spec.md`, the docs under `features.reads` and `features.writes`, AGENTS.md, and a previous result file for that task if there is one. Nothing else. The delta is applied by the watcher, so the agent never edits feature docs.

Lint, run by `osq approve`:

| Check                                       | Result |
|---------------------------------------------|--------|
| task `scope` has more than 8 patterns       | reject |
| `features.writes` has more than 2 entries   | reject |
| more than one table under `## Contract`     | reject |
| task `verify` empty or chains commands      | reject |
| `depends_on` names a missing change         | reject |
| task acceptance longer than 7 lines         | reject |
| `## Delta` empty while `features.writes` is not | reject |
| task title contains " and "                 | warn   |

Rules the lint can't check: title reads "when X, Y happens"; slice vertically so every spec leaves `main` green on its own; no "investigate" or "decide" in a spec (that's a spike, whose output is a paragraph in a feature doc or an ADR); default to a parent with children and approve the list before writing any child in full.

## What the watcher guarantees

- State is rebuilt from `specs/` on every change. Kill it and restart it any time.
- One agent per spec: locks are created exclusively, stale locks (dead pid or timeout) are reaped to `dead/`.
- What runs is what was approved: `.run/approved` holds a hash of the folder minus `.run/` (with `tasks.md` checkbox state normalized), checked before every spawn.
- `done` means the watcher ran `verify` itself in a timeout-bounded process group after the agent exited. The agent's claim is not enough.
- Feature docs are only ever changed by the watcher applying an approved delta. Agents never touch `features/`.
- The agent prompt protocol restricts write paths to `.run/results/` and edits to `scope`. All markers and checkboxes are written by the watcher.
- No result file on exit is `dead` with `reason: no_result`. Nothing disappears silently.

Reasons emitted: `verify_red` (with `timed_out: true` if verify exceeded timeout), `spec_conflict`, `already_running`, `no_result`, `crashed`, `timeout`.

## Harnesses

`OSQ_HARNESS` picks an adapter. An adapter does two things: spawn an agent for a tier (`coding` or `smart`) and write its harness's config files (`osq setup`). Adapters translate the harness's own event stream into six events (`started`, `tokens`, `file_changed`, `verify_ran`, `result_written`, `exited`), appended to the task's `.run/events/<n>.jsonl`. Hooks are optional shims that append to the same file. The loop works without them.

Available adapters:
- `agy`: Antigravity harness adapter
- `opencode`: OpenCode harness adapter running tasks via `opencode run`
- `mock`: In-memory deterministic simulation for tests

Configure `opencode` in `osq.config.ts`:

```ts
import { defineConfig } from 'osq';

export default defineConfig({
  harness: 'opencode',
  opencode: {
    bin: 'opencode',
    model: 'deepseek/deepseek-flash',
    agent: 'osq-coder',
    variant: 'thinking', // optional
  },
});
```

Running `osq setup` with the `opencode` harness scaffolds `.opencode/agent/osq-coder.md` with restricted permissions (denying `webfetch` and `websearch`) and the managed `AGENTS.md` execution procedure. Note that the `--auto` flag approves any action the agent file does not deny.

## Commands

```
osq init            scaffold
osq setup           write harness config for OSQ_HARNESS
osq new <name>      new change folder from the template
osq watch           run the watcher
osq approve <id>..  lint, hash, approve. also re-approves after fixing a dead task
osq status          every change and task with its state
osq show <id>       spec, tasks, results, dead markers, event timeline
osq report          completion rate, dead by reason, cost and time per task
```

## Not yet

Decided but deliberately unbuilt until the loop has closed on real work:

- Concurrency above 1, with a worktree per running task and merge on done (`reason: merge_conflict`).
- Hard OS/container sandbox confinement enforcing `scope` boundaries and filesystem write limits (`reason: scope_violation`).
- Pre-spawn dependency and context verification checks (`reason: missing_dep`, `reason: missing_context`).
- Deterministic section-level replacement for feature doc deltas (ADR 002).
- Containerized coding agents.
- A derived SQLite index under `~/.osq/` for `status` and `report` across projects. Files stay the source of truth; the index is gitignored and can be deleted at any time.
- Hook shims for harnesses, and `osq import` for OpenSpec change folders.

## Status

Early. Written in TypeScript so `npx` is the whole install and the glue (spawning, JSON streams, file watching, git) stays short; the filesystem protocol means the watcher could be rewritten in another language later without consumers noticing. Numbers in `osq.config.ts` are guesses until `osq report` says otherwise. See `decisions/` for why things are the way they are.

MIT.
