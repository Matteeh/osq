# osq

Strict spec queue. Spec-driven development with two kinds of agent and a human gate between them.

A smart model helps you write small, immutable task specs. A watcher hands each approved spec to a fresh, cheap coding agent that does the work, writes a result, and exits. Failures go to a dead letter queue you deal with next time you sit down. Nothing runs that you didn't approve, and nothing is marked done that the watcher didn't verify itself.

If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.

## Install

osq requires Node.js 24 LTS or newer (`engines.node: >=24.0.0`).

```sh
npx @matteeh/osq init          # scaffolds the folders below and configuration
pnpm add -D @matteeh/osq       # adds osq as a devDependency (or npm i -D @matteeh/osq)
pnpm osq watch                 # start the watcher
```

`init` is idempotent. Run it again after upgrading to refresh the managed blocks in `AGENTS.md`, `PLANNER.md`, and `.claude/commands/osq-plan.md`; it never touches anything else you've edited and preserves foreign managed blocks. Until you do, `osq doctor` reports the drift.

Run `osq init --refresh-schema` to pick up a new OpenSpec schema. It overwrites the six scaffolded schema files — `openspec/config.yaml`, `openspec/schemas/osq/schema.yaml`, `openspec/schemas/osq/README.md`, and `openspec/schemas/osq/templates/{proposal,spec,tasks}.md` — from the installed templates, so any local edits to those files are replaced. It leaves files that already match untouched, and it does not touch `osq.config.ts` or `.env.example`. Review or commit your diff first.

## Upgrading

Resolver 2 changes the automated done-marker hashes for active changes. On the first watcher cycle after upgrading, a completed task in an active change whose `.run/done/<n>` lacks `scope_resolver: 2` is detected even when its recorded aggregate hash still matches. This is a one-time recertification wave: the watcher runs each affected task's `verify` at detection, writes one idempotent `.run/regressed/<n>.md` scope-regression marker carrying the recorded and current resolver versions, and halts the change. Review each marker and run `osq retry <id> <task>` to recertify that task explicitly; a passing verification refreshes the marker with resolver-2 hashes. Markers inside `openspec/changes/archive/` are not rewritten or audited by this migration.

## What it puts in your repo

`osq init` writes the files marked `*`; the rest appear as you plan and run changes.

```
AGENTS.md *        your existing file, plus a managed block: the executor protocol and a pointer for planners
PLANNER.md *       the managed planner protocol
.claude/commands/  osq-plan.md *, the Claude Code planning command (slug as $ARGUMENTS)
osq.config.ts *    harness selection; every limit, timeout, and gate has a default you can override here
.env.example *     OSQ_HARNESS and API keys
openspec/
  config.yaml *    OpenSpec project configuration
  schemas/osq/ *   workflow schema and templates
  queue.md         optional brief queue read by `osq queue` and `osq plan --next`
  specs/           living capability specifications (e.g. cli-foundation/spec.md)
  changes/
    042-order-cancellation/
      proposal.md  parent spec: goal, verify, non-goals, contract, human steps, delta
      plan-prompt.md  the planning prompt `osq plan` writes; removed at archive
      tasks.md     task checklist, ticked by the watcher
      tasks/1.md   unit of work: acceptance, verify, scope, entry, tests.modify
      tasks/2.md
      specs/       delta specifications, one per capability the change writes
      .run/        approved (hash), manifest.json, running/, done/, dead/, regressed/, results/, events/
    archive/       finished change folders, moved whole
    rejected/      rejected change folders, preserved with audit reason
decisions/         ADRs, superseded not edited
```

A change folder is a feature. A task is one unit of work for one agent. After approval the folder is read-only until every task is done or one is dead. State is which marker files exist under `.run/`, never a field in a document.

## The loop

```
you + smart model   plan change folder   ->  osq plan <name> --brief <file> -> openspec/changes/042-x/ with plan-prompt.md
you                 lint / approve       ->  osq approve <id> -> .run/approved, .run/manifest.json
watcher             spawn per task       ->  cheap agent, fresh context, capability rules injected
agent               work, write result   ->  .run/results/1.md, exit
watcher             verify, tick box     ->  .run/done/1  or  .run/dead/1.md
watcher             last task done       ->  re-verify the final tree, merge deltas into openspec/specs/, archive
you                 next time            ->  osq (inbox) -> needs you, running, landed since last look
you                 fix / triage         ->  osq retry <id> <task|change>  or  osq reject <id> --reason <text>
```

Smart models author specs and never execute them. Cheap models execute specs and never author them.

## Gates and permissions

- **Approval gate.** Nothing runs until a human runs `osq approve`. It lints the change, hashes the folder, and writes `.run/approved` plus `.run/manifest.json`.
- **Verification gate.** The watcher never trusts the agent's claim. It runs each task's `verify` in its own process after the agent exits and writes `.run/done/<n>` only on exit 0; a non-zero exit becomes `.run/dead/<n>.md`.
- **Change verification after every task.** When the task's `verify` passes, the watcher also runs the proposal's change-level `verify` (`gates.changeVerifyAfterTask`, on by default). A red result kills the task with `change_verify_red`, so every task must leave the whole change green.
- **Scope recertification.** Before each task and again before archiving, the watcher re-hashes the resolved `scope` of every done task. If a later task changed any of those files, it re-runs that task's `verify`, writes `.run/regressed/<n>.md`, and halts the change until you run `osq retry <id> <n>`.
- **Archive verification.** Before archiving, the watcher re-runs every task's `verify` and the change-level `verify` against the final tree, halting with `.run/regressed/<n>.md` (or `.run/regressed/change.md`) if any fails.
- **State from disk.** The only authoritative state is which marker files exist under `.run/`: `running/<n>.pid`, `done/<n>`, `dead/<n>.md`, `regressed/<n>.md`, and `approved`. There is no in-memory state that matters, so the watcher can be killed and restarted at any time.
- **Executor permissions.** A coding agent may write only `.run/results/<n>.md` and files inside its task's `scope`. It may not edit living capability specs, `tasks.md`, or marker files. The watcher writes markers and checkboxes automatically; a human writes the rest through `osq approve`, `osq retry`, `osq reject`, and `osq done`.

## Change folder

`proposal.md` is written for humans and the smart model:

```markdown
---
title: Order cancellation
depends_on: ["041"]
verify: pnpm test
features:
  reads:
    - inventory-reservation
---
## Goal
## Verify
## Non-goals
## Surface
## Contract
## Human steps
## Delta
```

The frontmatter `verify` is the change-level command the watcher runs after every task and before archiving. Capability writes are not declared in frontmatter: the set of delta specs under `specs/<capability>/spec.md` is the authoritative declaration of what the change writes.

`## Surface` lists the user-facing names the change adds, changes, or removes — commands, flags, config keys, frontmatter fields, document sections, dead reasons, and event types; a change with none of those writes `None`.

A delta spec holds the exact text the capability spec will contain after the change, grouped under an OpenSpec operation heading:

```markdown
# Spec Delta: Order State Machine

## ADDED Requirements

### Requirement: Cancellation handling
<!-- source: src/orders/cancel.ts -->
When an order is in PENDING state, cancellation SHALL release its reservation.

#### Scenario: Successful cancellation
- **WHEN** user requests cancellation for a pending order
- **THEN** status transitions to CANCELLED and reservation is released
```

`## MODIFIED Requirements` repeats a requirement's full new text; `## REMOVED Requirements` and `## RENAMED Requirements` complete the set.

`tasks/<n>.md` is what a coding agent gets:

```yaml
---
title: When a PENDING order is cancelled, its reservation is released
verify: pnpm test -- orders/cancel
scope: [src/orders/**, tests/orders/**]
entry: [src/orders/service.ts]
tests:
  modify: false   # true lets the task change preexisting tests inside its scope
skills: []
---
## Acceptance
- [ ] each line is a test in disguise
```

Tasks run in order. The agent reads its task, the parent `proposal.md`, the delta specs and capability docs it names, `AGENTS.md`, and a previous result file for that task if there is one. The runner also injects capability-specific constraints and code ownership rules extracted from living capability specs. The delta is applied by the watcher, so the agent never edits living specs under `openspec/specs/`.

Lint, run by `osq approve` and `osq lint`. Limits come from `osq.config.ts`; defaults are shown.

| Check | Result |
| --- | --- |
| proposal has no `verify` in frontmatter | reject |
| proposal declares `features.writes` | reject |
| more than one table under `## Contract` | reject |
| `depends_on` names a missing change | reject |
| task `scope` has more than 8 patterns (`limits.maxScopeFiles`) | reject |
| task acceptance longer than 7 lines (`limits.maxAcceptanceLines`), or two lines fused into one | reject |
| task scope names a preexisting test without `tests.modify: true` | reject |
| task `verify` empty or chains commands | reject |
| `verify` is the planning sentinel | reject |
| `verify` names an absent package script | reject |
| `verify` names no existing path or package script | warn |
| a delta targets a requirement the living spec lacks, or is written as an instruction | reject |
| a file contains a prohibited control character | reject |
| OpenSpec schema or validator drift | reject |
| two tasks resolve the same scope file | warn |

`osq init` and `osq new` seed `verify: node -e "process.exit(0)"`. That is a planning sentinel, not trusted coverage: replace it before approval with a command that verifies the completed change's final tree. Checked-in fixtures use a local `node verify.cjs` verifier backed by files in their own execution root, never the sentinel, the network, a TTY, or this repository's full verification suite.

The rules lint can't check live in the managed `PLANNER.md` block: titles read "When X, Y"; every task leaves the change green on its own; a file belongs to one task; approve the task list before writing any task in full.

## What the watcher guarantees

- **Rebuilt from disk**: State is rebuilt from `openspec/` on every change. Kill it and restart it any time.
- **Single active agent**: One agent per change: locks are created exclusively, and stale locks (dead pid or timeout) are reaped to `dead/`.
- **Approved integrity & Manifest**: What runs is what was approved. `.run/approved` holds a hash of the folder minus `.run/` (with `tasks.md` checkbox state normalized), checked before every spawn. Approval generates `.run/manifest.json` recording hashes of `AGENTS.md`, `PLANNER.md`, configuration, and touched capability specs, along with runtime environment metadata.
- **Stale build detection**: In repository checkouts, the watcher verifies that compiled `dist/` is up-to-date with `src/`. If source files have changed without rebuilding, the watcher refuses to run unless `--allow-stale` or `--dev` is specified.
- **Prompt rule injection**: Living capability specs declare explicit code ownership (`### Requirement: Code ownership`). The runner extracts these boundaries and injects capability rules directly into the executor prompt.
- **Test modification gating**: Before spawning, the runner snapshots every preexisting file under `tests/`. A changed or deleted one kills the task with `reason: undeclared_test_change` unless the task declares `tests.modify: true` and its scope contains that file. New test files are always allowed.
- **Raw measures events**: Every task start and end emits a `measures` event capturing files/lines under scope, files/lines changed, repository baselines, file import counts, word counts, and requirement/scenario counts.
- **Deterministic spec merges**: Capability specs are only ever changed by the watcher applying an approved delta merge (ADR 002). Agents never touch `openspec/specs/`.
- **Synthesized results**: An agent that exits without writing `.run/results/<n>.md` is not lost: if the adapter captured a final text message, the watcher synthesizes a result file (`synthesized: true`) from it and proceeds to verify. Only an exit with neither a result file nor final text is `dead` with `reason: no_result`. Nothing disappears silently.

Dead reasons: `verify_red` (with `timed_out: true` if verify exceeded its timeout), `change_verify_red`, `undeclared_test_change`, `no_result`, `crashed`, `timeout`, `spec_conflict`, and `already_running`. A done task whose scoped files changed afterwards is recorded under `.run/regressed/<n>.md` with `reason: scope_regression`, and a failed archive-time change verify under `.run/regressed/change.md`; either stops the run before the next task spawns.

## Harnesses

`OSQ_HARNESS` picks an adapter. An adapter does two things: spawn an agent for a tier (`coding` or `smart`) and write its harness's config files (`osq setup`). Adapters translate the harness's own event stream into typed events (`started`, `tokens`, `tool`, `text`, `file_changed`, `result_written`, `exited`), and the watcher appends its own (`measures`, `verify_ran`, `done`, `done_manual`, `dead`, `regressed`, `retry`, `recertification`, `rejected`), all to the task's `.run/events/<n>.jsonl`. Hooks are optional shims that append to the same file. The loop works without them.

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

Running `osq setup` with the `opencode` harness scaffolds `.opencode/agent/osq-coder.md` with restricted permissions (denying `webfetch` and `websearch`) and the managed `AGENTS.md` execution procedure. Note that the `--auto` flag approves any action the agent file does not deny. The agent file must have mode `all` or `primary`; a subagent cannot be selected with --agent and OpenCode silently falls back to an unrestricted default. `webfetch` and `websearch` are denied at the tool level, but `bash` is allowed and unrestricted, so the agent can reach the network through the shell. Network isolation requires a sandbox, which osq does not provide.

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

As with every harness, scope is a protocol, not hard confinement: the prompt and the watcher's checks restrict the agent to its declared files, but they do not sandbox the filesystem or network beyond what the harness itself enforces. osq does not provide OS or container confinement.

#### Codex observations and costs

Each task is a fresh Codex session; osq never resumes a prior conversation. The watcher, not the adapter, owns result files, markers, checkboxes, and independent verification: if Codex exits without writing a result, the watcher synthesizes one from the final completed assistant message and still runs `verify` itself before writing `done`. Token counts come only from usage Codex actually reports (`turn.completed`), broken down into observed input, output, cached, and reasoning tokens; osq does not estimate usage or cost, and it reports cost only when the harness supplies it.

#### Live Codex smoke check (optional, human-owned)

Offline tests use a deterministic fake Codex executable and require no authentication, network access, or model. A separate optional live check, after installing and authenticating the real CLI, is to run one harmless approved fixture task and one interactive planning session, then confirm the watcher's verification, the emitted events and result file, harness/model attribution, and clean exits. Record the CLI version you tested; the offline suite does not establish a minimum supported Codex release.

## Commands

```
osq                      human attention inbox: needs you, running, landed since last look
osq --json               print human attention inbox as stable JSON
osq init                 scaffold openspec layout, config, AGENTS.md, PLANNER.md, and the Claude plan command
osq init --refresh-schema  overwrite the six scaffolded OpenSpec schema files from the installed templates
osq setup                write harness config for OSQ_HARNESS
osq new <name>           new change folder from template in openspec/changes/
osq plan [name]          create a change, write plan-prompt.md, and hand off to your planning tool
osq queue                print the read-only brief queue from openspec/queue.md
osq lint [ids...]        validate change folders and OpenSpec artifacts against constraints
osq approve <ids...>     lint, hash, approve change; write .run/approved and .run/manifest.json
osq retry <id> <target>  retry a dead or regressed task, or a change-level regression
osq reject <id>          move an unapproved or failed change intact into rejected history
osq done <id> <task>     mark a task done manually with required justification (--manual)
osq watch                run the watcher loop
osq status               overview of all changes, tasks, and runtime states
osq show <id>            change details, tasks, results, dead markers, and event timeline
osq report               delivery metrics, completion rates, failure reasons, durations, and costs
osq serve [--port <n>]   local read-only delivery dashboard on 127.0.0.1 (--open to launch it)
osq serve --export <dir> write a static dashboard snapshot to <dir> and exit
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

Planning is prompt handoff by default: osq writes the complete five-section
opening prompt to `plan-prompt.md` in the change folder and hands off to the
tool you already use.

```sh
osq plan <name> --brief <file>  # create the change, write plan-prompt.md, and print the handoff line
osq plan --next                 # same handoff for the first eligible item in openspec/queue.md
osq plan --next --replan        # allow replanning a rejected first eligible queue item
```

The default path constructs and spawns no harness: it writes an exact prompt
file, records `planner: null` in `brief.md`, and prints one line containing the
folder path and `ask your planning tool to plan change <slug>`. Ask that tool to
plan the change.

`init` installs the planning entry points that consume the prompt:

- Claude Code reads `.claude/commands/osq-plan.md`, which takes the change slug
  as its `$ARGUMENTS` argument and reads `plan-prompt.md`.
- Codex and other tools that read `AGENTS.md` find its `Planning a change`
  section, which sends planners to `PLANNER.md` and names `plan-prompt.md` as
  the complete prompt when `osq plan` started the session.

The managed `PLANNER.md` block covers both interactive planning and the handoff.
Every entry point tells the tool to write only inside the change folder, run
`osq lint <slug>` and fix every finding, and never run `osq approve`.

Model choice belongs to the planning tool unless osq is explicitly asked to
launch the session, so the generated `osq.config.ts` contains no required
planner model. Explicit session and print modes remain available:

```sh
osq plan <name> --brief <file> --session  # launch the configured planner in the terminal
osq plan <name> -p, --print               # emit the prompt to stdout only; no file, process, or record
```

`--session` restores the osq-owned interactive planner: it selects the
configured planner exactly as before, attributes the brief to that model, and
records the owned lifecycle and usage. Planner `harness`, `model`, and `agent`
validation applies only there. `--print` emits the same prompt bytes to stdout
without writing `plan-prompt.md`, spawning a process, or recording telemetry.

When you run `osq approve <id>`, osq observes local Codex, OpenCode, and Claude
Code sessions whose file edits fall inside the change folder during its
lifetime and records any matches as observed planning sessions. It never
estimates missing values, never retains transcript content, and never sends
anything off the machine.

### Retry & Rejection

```sh
osq retry <id> <task>           # retry a dead task or recertify a regressed one (e.g. osq retry 042 1)
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

### Delivery Dashboard

```sh
osq serve                 # local dashboard at the configured serve.port, default http://127.0.0.1:4173/
osq serve --port 0        # ask the OS for an ephemeral loopback port
osq serve --open          # launch the printed URL in the default browser
osq serve --export ./demo # write a static snapshot to ./demo and exit without serving
```

`osq serve` starts a Node HTTP server bound only to `127.0.0.1` and prints its
exact URL. The CLI `--port` option overrides `serve.port` from `osq.config.ts`;
`--port 0` requests an operating-system-assigned port, and only integers from 0
through 65535 are accepted. `--open` launches the printed URL through the
platform's default browser without adding a runtime dependency.

`osq serve --export <dir>` writes a self-contained snapshot of every dashboard
view into an empty or missing `<dir>` and exits 0 without binding a port or
opening a browser. The snapshot needs a static host and cannot be opened
directly from `file://`, and it scrubs only the project root and home directory
paths, so read the export before publishing it.

The dashboard is one hash-routed read-only page: `#/report` renders delivery
charts, `#/graph` renders the capability archive graph, and `#/changes/<key>`
renders detailed change evidence. Every request recomputes its document from
the current filesystem and keeps no cache, and the page treats filesystem
notifications only as a signal to refetch. It uses system fonts, same-origin
requests, and no external asset, and respects `prefers-color-scheme`.

`osq serve` is for local inspection only. It has no write endpoint, no
authentication, no remote binding, and no hosting story; it never starts the
execution watcher or writes project, cursor, or marker files. SIGINT and SIGTERM
close the HTTP listener and its filesystem watcher. Startup failures such as an
address already in use print one actionable error and exit nonzero.

## Diagnostics & Health

Run `osq doctor` to verify repository health:

- `config`: confirms `osq.config.ts` is valid and well-formed
- `harness`: checks that the configured harness binary (e.g. `opencode`, `agy`) exists and is executable
- `managed-blocks`: verifies the `AGENTS.md`, `PLANNER.md`, and `.claude/commands/osq-plan.md` managed sections match the installed osq version (run `osq init` to repair drift)
- `locks`: checks for orphaned `.run/running/*.pid` locks and processes
- `archives`: validates integrity of archived change folders
- `done-markers`: flags any done marker in an active change that neither the watcher nor `osq done --manual` wrote
- `validator`: ensures `@fission-ai/openspec` is installed and matches the pinned version (`1.13.1`)

## Release Procedure

To release a new version of `osq`:

1. Bump `"version"` in `package.json`.
2. Add a corresponding release section in `CHANGELOG.md`.
3. Commit the changes: `git commit -am "release: v<x.y.z>"`.
4. Create and push the release tag: `git tag v<x.y.z> && git push --tags`.
5. GitHub Actions (`release.yml`) verifies the build and publishes to npm with provenance via trusted publishing.

## Status

Early. Written in TypeScript so `npx` is the whole install and the glue (spawning, JSON streams, file watching, git) stays short; the filesystem protocol means the watcher could be rewritten in another language later without consumers noticing. Numbers in `osq.config.ts` are guesses until `osq report` says otherwise. See `decisions/` for why things are the way they are.

MIT.
