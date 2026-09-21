# osq

Strict spec queue. Spec-driven development with two kinds of agent and a human gate between them.

A smart model helps you write small, immutable task specs. A watcher hands each approved spec to a fresh, cheap coding agent that does the work, writes a result, and exits. Failures go to a dead letter queue you deal with next time you sit down. Nothing runs that you didn't approve, and nothing is marked done that the watcher didn't verify itself.

If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.

## Install

```sh
npx @matteeh/osq init          # scaffolds the folders below and configuration
pnpm add -D @matteeh/osq       # adds osq as a devDependency (or npm i -D @matteeh/osq)
pnpm osq watch                 # start the watcher
```

`init` is idempotent. Run it again after upgrading to refresh the managed blocks in `AGENTS.md` and `PLANNER.md`; it never touches anything else you've edited and preserves foreign managed blocks.

## What it puts in your repo

```
AGENTS.md          your existing file, plus a managed block with the coding agent procedure
PLANNER.md         guidelines for the planner model to scaffold cohesive changes
osq.config.ts      limits, paths, test gating, and harness configuration
openspec/
  specs/           living capability specifications (e.g. cli-foundation/spec.md)
  changes/
    042-order-cancellation/
      proposal.md  parent spec: goal, contract, non-goals, reads
      tasks.md     high-level task checklist, ticked by the watcher
      tasks/1.md   unit of work: acceptance, verify, scope, entry, tests.modify
      tasks/2.md
      specs/       delta specifications applied per capability
      .run/        approved (hash), manifest.json, running/, done/, dead/, regressed/, results/, events/
    archive/       finished change folders, moved whole
    rejected/      rejected change folders, preserved with audit reason
  schemas/osq/     workflow schema and templates
  config.yaml      OpenSpec project configuration
decisions/         ADRs, superseded not edited
.env.example       OSQ_HARNESS and API keys
```

A change folder is a feature. A task is one unit of work for one agent. After approval the folder is read-only until every task is done or one is dead. State is which marker files exist under `.run/`, never a field in a document.

## The loop

```
you + smart model   plan change folder   ->  osq plan <name> -> openspec/changes/042-x/ with proposal.md, tasks/, specs/
you                 lint / approve       ->  osq approve -> .run/approved, .run/manifest.json
watcher             spawn per task       ->  cheap agent, fresh context, capability rules injected
agent               work, write result   ->  .run/results/1.md, exit
watcher             verify, tick box     ->  .run/done/1  or  .run/dead/1.md
watcher             last task done       ->  apply delta merges to openspec/specs/, archive folder
you                 next time            ->  osq (inbox) -> needsYou, running, landed since last look
you                 fix / triage         ->  osq retry <id> <task|change>  or  osq reject <id> --reason <text>
```

Smart models author specs and never execute them. Cheap models execute specs and never author them.

## Gates and permissions

- **Approval gate.** Nothing runs until a human runs `osq approve`. It lints the change, hashes the folder, and writes `.run/approved` plus `.run/manifest.json`.
- **Verification gate.** The watcher never trusts the agent's claim. It runs each task's `verify` in its own process after the agent exits and writes `.run/done/<n>` only on exit 0; a non-zero exit becomes `.run/dead/<n>.md`. Before archiving it re-runs every task's `verify` and the proposal's change-level `verify` against the final tree, halting with `.run/regressed/<n>.md` (or `.run/regressed/change.md`) if any fails.
- **State from disk.** The only authoritative state is which marker files exist under `.run/`: `running/<n>.pid`, `done/<n>`, `dead/<n>.md`, `regressed/<n>.md`, and `approved`. There is no in-memory state that matters, so the watcher can be killed and restarted at any time.
- **Executor permissions.** A coding agent may write only `.run/results/<n>.md` and files inside its task's `scope`. It may not edit living capability specs, `tasks.md`, or marker files; all markers and checkboxes are written by the watcher.

## Change folder

`proposal.md` is written for humans and the smart model:

```yaml
---
title: Order cancellation
depends_on: ["041"]
features:
  reads:
    - inventory-reservation
---
## Goal
## Contract
## Non-goals
```

Capability writes are not declared in frontmatter: the set of delta specs under `specs/<capability>/spec.md` is the authoritative declaration of what the change writes.

Delta specs under `specs/<capability>/spec.md` describe exact capability requirements:

```markdown
# Delta: Order State Machine

### Requirement: Cancellation handling

<!-- source: src/orders/cancel.ts -->

When an order is in PENDING state, cancellation SHALL release its reservation.

#### Scenario: Successful cancellation

- **WHEN** user requests cancellation for a pending order
- **THEN** status transitions to CANCELLED and reservation is released
```

`tasks/<n>.md` is what a coding agent gets:

```yaml
---
title: When a PENDING order is cancelled, its reservation is released
verify: pnpm test -- orders/cancel
scope: [src/orders/**, tests/orders/**]
entry: [src/orders/service.ts]
tests:
  modify: false   # set to true if existing test files must be modified
skills: []
---
## Acceptance
- [ ] each line is a test in disguise, max 7
```

Tasks run in order. The agent reads its task, the parent `proposal.md`, the delta specs and capability docs the proposal names, `AGENTS.md`, and a previous result file for that task if there is one. The runner also injects capability-specific constraints and code ownership rules extracted from living capability specs. The delta is applied by the watcher, so the agent never edits living specs under `openspec/specs/`.

Lint, run by `osq approve` and `osq lint`:

| Check                                   | Result |
| --------------------------------------- | ------ |
| task `scope` has more than 8 patterns   | reject |
| proposal declares `features.writes`     | reject |
| more than one table under `## Contract` | reject |
| task `verify` empty or chains commands  | reject |
| `depends_on` names a missing change     | reject |
| task acceptance longer than 7 lines     | reject |
| task title contains " and "             | warn   |
| OpenSpec schema or validator drift      | reject |

Rules the lint can't check: title reads "when X, Y happens"; slice vertically so every spec leaves `main` green on its own; no "investigate" or "decide" in a spec (that's a spike, whose output is a paragraph in a capability spec or an ADR); default to a parent with children and approve the list before writing any child in full.

## What the watcher guarantees

- **Rebuilt from disk**: State is rebuilt from `openspec/` on every change. Kill it and restart it any time.
- **Single active agent**: One agent per spec: locks are created exclusively, stale locks (dead pid or timeout) are reaped to `dead/`.
- **Approved integrity & Manifest**: What runs is what was approved. `.run/approved` holds a hash of the folder minus `.run/` (with `tasks.md` checkbox state normalized), checked before every spawn. Approval generates `.run/manifest.json` recording hashes of `AGENTS.md`, `PLANNER.md`, configuration, and touched capability specs, along with runtime environment metadata.
- **Stale build detection**: In repository checkouts, the watcher verifies that compiled `dist/` is up-to-date with `src/`. If source files have changed without rebuilding, the watcher refuses to run unless `--allow-stale` or `--dev` is specified.
- **Prompt rule injection**: Living capability specs declare explicit code ownership (`### Requirement: Code ownership`). The runner extracts these boundaries and injects capability rules directly into the executor prompt.
- **Test modification gating**: If a task touches existing test files without declaring `tests.modify: true` in its frontmatter, the runner halts the task with `reason: undeclared_test_change`.
- **Raw measures events**: Every task start and end emits a `measures` event capturing files/lines under scope, files/lines changed, repository baselines, file import counts, word counts, and requirement/scenario counts.
- **Independent verification**: `done` means the watcher ran `verify` itself in a timeout-bounded process group after the agent exited. The agent's claim is not enough.
- **Deterministic spec merges**: Capability specs are only ever changed by the watcher applying an approved delta merge (ADR 002). Agents never touch `openspec/specs/`.
- **Restricted agent protocol**: The agent prompt protocol restricts write paths to `.run/results/` and edits to `scope`. All markers and checkboxes are written by the watcher.
- **Synthesized results**: An agent that exits without writing `.run/results/<n>.md` is not lost: if the adapter captured a final text message, the watcher synthesizes a result file (`synthesized: true`) from it and proceeds to verify. Only an exit with neither a result file nor final text is `dead` with `reason: no_result`. Nothing disappears silently.

Reasons emitted: `verify_red` (with `timed_out: true` if verify exceeded timeout), `spec_conflict`, `already_running`, `no_result` (no result file and no final text), `crashed`, `timeout`, `undeclared_test_change`. A previously completed task whose scoped files no longer match their recorded hash is recorded under `.run/regressed/<n>.md` (and the change-level `verify` under `.run/regressed/change.md`), which stops the run before the next task spawns.

## Harnesses

`OSQ_HARNESS` picks an adapter. An adapter does two things: spawn an agent for a tier (`coding` or `smart`) and write its harness's config files (`osq setup`). Adapters translate the harness's own event stream into typed events (`started`, `tokens`, `tool`, `text`, `file_changed`, `verify_ran`, `result_written`, `measures`, `exited`, `done`, `dead`), appended to the task's `.run/events/<n>.jsonl`. Hooks are optional shims that append to the same file. The loop works without them.

Available adapters:

- `agy`: Antigravity harness adapter
- `codex`: Codex CLI harness adapter running tasks via `codex exec` and planning via the Codex TUI
- `opencode`: OpenCode harness adapter running tasks via `opencode run`
- `mock`: In-memory deterministic simulation for tests

Configure `opencode` in `osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

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

Running `osq setup` with the `opencode` harness scaffolds `.opencode/agent/osq-coder.md` with restricted permissions (denying `webfetch` and `websearch`) and the managed `AGENTS.md` execution procedure. Note that the `--auto` flag approves any action the agent file does not deny. The agent file must have mode `all` or `primary`; a subagent cannot be selected with --agent and OpenCode silently falls back to an unrestricted default. `webfetch` and `websearch` are denied at the tool level, but `bash` is allowed and unrestricted, so the agent can reach the network through the shell. Network isolation requires a sandbox and is listed under "Not yet".

### Codex CLI

Select Codex as the executor in `osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: 'codex',
  codex: {
    // All fields are optional; omit any of them to use Codex's native value.
    // bin: '/path/to/codex',   // codex.bin -> CODEX_PATH -> `codex`
    // model: '<your-model>',   // codex.model -> OSQ_MODEL (Codex executor only) -> native
    // effort: '<your-effort>', // codex.effort -> native default
  },
});
```

Setting `OSQ_HARNESS=codex` in the environment or `.env` also selects Codex, but an explicit `harness` in `osq.config.ts` wins over that fallback. Binary precedence is `codex.bin`, then `CODEX_PATH`, then `codex` on `PATH`. Model precedence is `codex.model`, then `OSQ_MODEL` only when Codex is the executor, then Codex's native default; `effort` is `codex.effort` or the native default. With no model configured, osq records `default` rather than guessing one.

Planning can use a different harness and model from execution:

```ts
export default defineConfig({
  harness: 'opencode',
  planner: {
    harness: 'codex',
    model: '<your-planner-model>', // required, must be non-empty
    // agent is unsupported for codex; config validation rejects it.
  },
});
```

Codex has no planner-agent concept, so `planner.agent` is unsupported and `defineConfig` rejects it with a clear error rather than ignoring it. An explicit `planner` block never inherits the executor's `OSQ_MODEL` or effort; when planning falls back to a Codex executor, the brief records `default` and no model flag is passed to Codex.

#### Codex setup and prerequisites

Install the Codex CLI and authenticate it in the same host environment where osq runs. osq reuses Codex's native authentication and configuration; it never reads, writes, or manages your credentials or bypasses Codex policies. `osq setup` for Codex generates no Codex-specific files: it only maintains the shared managed `AGENTS.md` block and preserves foreign blocks, because Codex uses the same executor protocol as every other harness.

`osq doctor` probes the configured binary with `--version` using the same resolution as the adapter, and the watcher runs the same preflight before the first task. A missing, nonzero, or timed-out probe fails clearly before any task executes.

#### Codex permissions

Executor tasks run a fresh noninteractive process per task in the project root with `--ask-for-approval never` and `--sandbox workspace-write`, web search disabled, and workspace shell network access disabled. There is no session resume, `--auto`, or permission-bypass flag, and the prompt is passed as one literal argument.

Interactive planning launches the Codex TUI with `--ask-for-approval on-request` and `--sandbox workspace-write`, using Codex's native reasoning-effort default rather than the executor's `codex.effort`.

As with every harness, scope is a protocol, not hard confinement: the prompt and the watcher's checks restrict the agent to its declared files, but they do not sandbox the filesystem or network beyond what the harness itself enforces. Hard OS/container confinement remains under "Not yet".

#### Codex observations and costs

Each task is a fresh Codex session; osq never resumes a prior conversation. The watcher, not the adapter, owns result files, markers, checkboxes, and independent verification: if Codex exits without writing a result, the watcher synthesizes one from the final completed assistant message and still runs `verify` itself before writing `done`. Token counts come only from usage Codex actually reports (`turn.completed`), broken down into observed input, output, cached, and reasoning tokens; osq does not estimate usage or cost, and it reports cost only when the harness supplies it.

#### Live Codex smoke check (optional, human-owned)

Offline tests use a deterministic fake Codex executable and require no authentication, network access, or model. A separate optional live check, after installing and authenticating the real CLI, is to run one harmless approved fixture task and one interactive planning session, then confirm the watcher's verification, the emitted events and result file, harness/model attribution, and clean exits. Record the CLI version you tested; the offline suite does not establish a minimum supported Codex release.

## Commands

```
osq                      human attention inbox: needsYou, running, landed since last look
osq --json               print human attention inbox as stable JSON
osq init                 scaffold openspec layout, config, AGENTS.md, and PLANNER.md
osq setup                write harness config for OSQ_HARNESS
osq new <name>           new change folder from template in openspec/changes/
osq plan <name>          initialize change, write brief, and open interactive planner session
osq lint [ids...]        validate change folders and OpenSpec artifacts against constraints
osq approve <ids...>     lint, hash, approve change; write .run/approved and .run/manifest.json
osq retry <id> <target>  retry a dead or regressed task, or a change-level regression
osq reject <id>          move an unapproved or failed change intact into rejected history
osq done <id> <task>     mark a task done manually with required justification (--manual)
osq watch                run the watcher loop
osq status               overview of all changes, tasks, and runtime states
osq show <id>            change details, tasks, results, dead markers, and event timeline
osq report               delivery metrics, completion rates, failure reasons, durations, and costs
osq doctor               validate repository health, harness availability, and pinned validator
osq migrate openspec     migrate a legacy osq layout to the canonical openspec/ layout
```

### Human Attention Inbox

Running bare `osq` serves as the entrypoint for human attention:

- **Needs you**: unapproved proposals, active dead tasks, active regressed tasks, and change-level regressions, each ending with its exact action command (`osq approve <id>`, `osq retry <id> <n>`, or `osq reject <id> --reason <text>`).
- **Running**: actively executing tasks with verified live PID, start time, and elapsed duration.
- **Landed since last look**: changes archived strictly after your project's previous look (tracked per project in `~/.osq/last-look/`), or the newest 10 on first look.

Use `osq --json` to consume this contract programmatically without extra terminal formatting.

### Planning

```sh
osq plan <name>                 # interactive planning session with configured planner
osq plan <name> --brief <file>  # initialize from an existing brief document (or - for stdin)
osq plan <name> -p, --print     # emit the opening prompt to stdout without launching a session
```

### Retry & Rejection

```sh
osq retry <id> <task>           # retry a dead or regressed task (e.g. osq retry 042 1)
osq retry <id> change           # clear an active change-level regression after fixing root cause
osq reject <id> --reason <text> # move an unapproved or failed change to openspec/changes/rejected/
osq done <id> <task> --manual "<reason>" # manually satisfy a task with required reason
```

### Watcher options

```sh
osq watch                # run watcher event loop continuously
osq watch -o, --once     # process all queued approved tasks and exit
osq watch --dev          # reactive dev mode running directly from src/ via tsx with auto-restart
osq watch --allow-stale  # allow running from repository checkout when dist/ is older than src/
osq watch --verbose      # enable verbose execution logging
osq watch -q, --quiet    # suppress info and verbose output
```

### Metrics & Reporting

```sh
osq report               # formatted terminal report
osq report --json        # raw JSON report for scripting and CI pipelines
```

`osq report` renders completion rate, failures by reason, execution durations, token usage, and file changes. Reported cost sums the `cost` values carried by harness events. Reported cost reflects the harness's internal price table rather than the invoice.

## Diagnostics & Health

Run `osq doctor` to verify repository health:

- `config`: confirms `osq.config.ts` is valid and well-formed
- `harness`: checks that the configured harness binary (e.g. `opencode`, `agy`) exists and is executable
- `managed-blocks`: verifies `AGENTS.md` and `PLANNER.md` managed sections are up to date
- `locks`: checks for orphaned `.run/running/*.pid` locks and processes
- `archives`: validates integrity of archived change folders
- `validator`: ensures `@fission-ai/openspec` is installed and matches the pinned version (`1.13.1`)

## Release Procedure

To release a new version of `osq`:

1. Bump `"version"` in `package.json`.
2. Add a corresponding release section in `CHANGELOG.md`.
3. Commit the changes: `git commit -am "release: v<x.y.z>"`.
4. Create and push the release tag: `git tag v<x.y.z> && git push --tags`.
5. GitHub Actions (`release.yml`) verifies the build and publishes to npm with provenance via trusted publishing.

## Not yet

Decided but deliberately unbuilt until the loop has closed on real work:

- Concurrency above 1, with a worktree per running task and merge on done (`reason: merge_conflict`).
- Hard OS/container sandbox confinement enforcing `scope` boundaries and filesystem write limits (`reason: scope_violation`).
- Pre-spawn dependency and context verification checks (`reason: missing_dep`, `reason: missing_context`).
- Containerized coding agents.
- A derived SQLite index under `~/.osq/` for `status` and `report` across projects. Files stay the source of truth; the index is gitignored and can be deleted at any time.

## Status

Early. Written in TypeScript so `npx` is the whole install and the glue (spawning, JSON streams, file watching, git) stays short; the filesystem protocol means the watcher could be rewritten in another language later without consumers noticing. Numbers in `osq.config.ts` are guesses until `osq report` says otherwise. See `decisions/` for why things are the way they are.

MIT.
