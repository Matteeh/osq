# osq

Strict spec queue. Spec-driven development with two kinds of agent and a human gate between them.

A smart model helps you write small, immutable task specs. A watcher hands each approved spec to a fresh, cheap coding agent that does the work, writes a result, and exits. Failures go to a dead letter queue you deal with next time you sit down. Nothing runs that you didn't approve, and nothing is marked done that the watcher didn't verify itself.

If a fresh agent could not pick up a task from the files in the repo alone, the files are wrong. Everything here follows from that.

## Install

osq requires Node.js 24 LTS or newer (`engines.node: >=24.0.0`).

```sh
npx @matteeh/osq init          # scaffolds the folders below and configuration
# answer and accept decisions/000-how-this-project-is-built.md, write the other architecture and style ADRs, then plan the first feature brief
pnpm add -D @matteeh/osq       # adds osq as a devDependency (or npm i -D @matteeh/osq)
pnpm osq watch                 # start the watcher
```

`init` is idempotent. Run it again after upgrading to refresh the managed blocks in `AGENTS.md`, `PLANNER.md`, and `.claude/commands/osq-plan.md`; it never touches anything else you've edited and preserves foreign managed blocks. Until you do, `osq doctor` reports the drift.

Run `osq init --refresh-schema` to pick up a new OpenSpec schema. It overwrites the six scaffolded schema files — `openspec/config.yaml`, `openspec/schemas/osq/schema.yaml`, `openspec/schemas/osq/README.md`, and `openspec/schemas/osq/templates/{proposal,spec,tasks}.md` — from the installed templates, so any local edits to those files are replaced. It leaves files that already match untouched, and it does not touch `osq.config.ts` or `.env.example`. Review or commit your diff first.

## Upgrading

To 0.3.0:

- `osq init` now scaffolds pi instead of agy.
- agy no longer bypasses its permission prompts by default, so a headless agy task cannot answer them and `osq watch` refuses to start.
- An agy project must set `agy: { dangerouslySkipPermissions: true }` in `osq.config.ts` or switch harness.
- Proposals gain an `## Assumptions` section. Run `osq init --refresh-schema` to pick up the new proposal template.
- The managed `AGENTS.md` and `PLANNER.md` blocks changed. Run `osq init` to refresh them; until you do, `osq doctor` reports the drift.
- Code that calls command functions directly: the `exit` option is gone from `landCommand`, `messageCommand`, `syncCommand`, `graphCommand`, `lintCommand`, `doctorCommand` and `migrateCommand`; catch the thrown `CommandError` instead.

To 0.2.4:

- Verify, `vcs.prepare`, and the harness no longer inherit osq's environment (ADR 007). A project whose tests need a variable such as `DATABASE_URL` must list it under `confinement.roles.verify.env`; see Role environments below.
- The commands that recorded a check by hand, or marked a task done without its verify, are gone. A proposal's `check:` command now runs at archive and when `osq land` merges a newer default branch; to finish a dead task, fix the cause and run `osq retry <id> <n>`.
- With `vcs.enabled`, land with `osq land <id>` instead of committing `osq message <id>` by hand, and `osq approve` removes the approved change folder from your checkout.
- `osq report` keeps a read index in `.osq/index.sqlite`. The folder ignores itself in git, and deleting it only costs the next report's speed.
- The managed `AGENTS.md` and `PLANNER.md` blocks changed. Run `osq init` to refresh them; until you do, `osq doctor` reports the drift.

To 0.2.2:

- The opencode adapter needs opencode 2. `osq doctor` and the watcher's preflight refuse opencode 1.
- A config file that exists but fails to import or validate now stops every command with `Error: Failed to load <path>: <message>` and exit 1. Earlier releases carried on with the defaults.
- The managed `AGENTS.md` and `PLANNER.md` blocks changed. Run `osq init` to refresh them; until you do, `osq doctor` reports the drift.

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
      proposal.md  parent spec: goal, verify, non-goals, surface, decisions, contract, human steps, delta
      plan-prompt.md  the planning prompt `osq plan` writes; removed at archive
      tasks.md     task checklist, ticked by the watcher
      tasks/1.md   unit of work: acceptance, verify, scope, entry, tests.modify, verify_starts
      tasks/2.md
      specs/       delta specifications, one per capability the change writes
      .run/        approved (hash), manifest.json, running/, done/, dead/, regressed/, results/, events/
    archive/       finished change folders, moved whole
    rejected/      rejected change folders, preserved with audit reason
decisions/ *       ADRs, superseded not edited; init writes a README and a starter ADR
.osq/              read index `osq report` and `osq query` keep; ignored by git, safe to delete
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
you + smart model   steer when osq asks  ->  osq plan <id> -> revise the plan -> osq approve <id>, the run continues
you                 fix / triage         ->  osq retry <id> <task|change>  or  osq reject <id> --reason <text>
```

Smart models author specs and never execute them. Cheap models execute specs and never author them.

## Gates and permissions

- **Approval gate.** Nothing runs until a human runs `osq approve`. It lints the change, hashes the folder, and writes `.run/approved` plus `.run/manifest.json`.
- **Approval digest.** Before sealing, `osq approve` prints a short digest: the goal, one line per task with its resolved-scope file count, and the requirements each delta adds, modifies, or removes. It then flags eight things worth a human look: `shared_file` (a path two tasks share), `sensitive_path` (a package manifest, lockfile, CI workflow, osq or OpenSpec config, managed instruction file, or env file in scope), `verify_without_test` (a verify naming no test file or runner), `removed_requirement` (a delta that removes requirements), `unknown_capability` (a delta for a capability with no living spec that either has no `## Purpose` or has a name resembling a living capability, and the label names which; a deliberate new capability instead prints `(new capability)` on its digest heading), `verify_starts_conflict` (a task that declares `green` or `any` while its verify names a missing test its own scope creates), `adr_departure` (a `Departs from ADR <n>:` line in `## Decisions`), and `adr_check_modified` (a task that may change an ADR's check file; see Architecture decisions). Flags never block by default: they print last, as information, and the approval line names them (`Approved <id> with N flags: ...`). Add `--confirm` to stop and ask about them instead.
- **Verification gate.** The watcher never trusts the agent's claim. It runs each task's `verify` in its own process after the agent exits and writes `.run/done/<n>` only on exit 0; a non-zero exit becomes `.run/dead/<n>.md`.
- **Change verification after every task.** When the task's `verify` passes, the watcher also runs the proposal's change-level `verify` (`gates.changeVerifyAfterTask`, on by default). A red result kills the task with `change_verify_red`, so every task must leave the whole change green. When the change-level verify fails only in tests the task never touched — each a preexisting, unchanged test under `tests/` that is outside the task's `scope` and imports nothing in it — the watcher reruns the change-level verify up to `gates.changeVerifyReruns` times (defaults to 1, `0` turns reruns off). A passing rerun lets the task finish and records a `change_verify_rerun` event naming the tests that failed; `osq report` lists those tests under `Flaky tests:` so someone can fix them.
- **Formatting.** When `gates.formatCommand` is set, the watcher runs it on the files the task changed inside its `scope` after the agent exits and before the task's `verify`, once, with `{files}` replaced by those files, each single-quoted and separated by spaces. A failing or timed-out command is recorded as a `format_ran` event and the task's `verify` still decides; nothing runs without the key.
- **Baseline verify.** When `gates.baselineVerify` names a command, the watcher runs it once in the project root before a change's first task spawns, to prove the tree was green before the change started. A non-zero exit kills the first task with `baseline_red` and prints "tree was red before this change started"; no agent spawns and the reason waits for `osq retry`. Under git, when HEAD and every dirty file outside a `.run/` folder are unchanged since the latest green baseline in any active or archived change, the watcher reuses it and records `baseline_ran` with `outcome: reused` instead of running the command; outside git, or with no commit, the command always runs.
- **Pre-spawn verify check.** Before a task's first attempt, the watcher runs that task's `verify` once and expects it to fail: a verify already green before any agent work means the work is done or the verify does not exercise the task. A task declares its expected start with `verify_starts` — `red` by default, `green` for work like a refactor that should already pass, or `any` when either is fine. A mismatch warns by default and the task continues; `gates.preSpawnVerify: fail` kills the task with `verify_precondition` before the agent spawns, and `off` disables the check. A mismatch shows in the task's `verify_ran` event, `osq show`, and `osq report`. A named path the verify refers to that does not exist yet is recorded as `missingPaths` on that event and does not count as a mismatch for a `red` task. The check adds one extra verify per task, on its first attempt only.
- **Automatic retry.** When a task dies for a reason a fresh attempt could fix — `verify_red`, `change_verify_red`, `undeclared_test_change`, `verify_path_missing`, `denied_dependency`, `vcs_violation`, `scope_violation`, `no_result`, `crashed`, `timeout`, or `provider_unavailable` — the watcher retries it without asking. A `provider_unavailable` death waits `gates.providerRetryDelaySeconds` (defaults to 300) after its latest `dead` event and spends its own `gates.providerRetries` budget (defaults to 3), never `gates.autoRetries`. Every other reason (`spec_conflict`, `verify_precondition`, `already_running`, `blocked`, `baseline_red`) waits for you. `gates.autoRetries` caps how many automatic retries a task gets since its approval or its last manual retry; it defaults to 1, `0` turns automatic retries off entirely, and a manual `osq retry` grants one more. Each retry's prompt carries the previous dead marker's body, so the fresh agent sees exactly what failed. When osq fails to commit a task's record, the watcher tries again on later cycles, up to `gates.commitRetries` (defaults to 2) since your last `osq retry <id> change`, and clears the `commit_failed` halt itself once the commit goes through.
- **Provider outages.** Pi reports the provider's own retry as a `harness_retry` event. While a task runs, the watcher stops its agent with SIGTERM once that open retry has lasted `gates.providerStallSeconds` (defaults to 300); `0` turns the early stop off. The death is then recorded as `provider_unavailable` with the provider's error, and retried on its own budget without ever being marked stuck.
- **Stuck tasks.** Every dead marker records a `fingerprint` over its reason and body, ignoring details a rerun changes: ISO timestamps, durations, PIDs, ANSI codes, and absolute paths under the project root. When a task dies again with the same fingerprint as its most recent retained death, the watcher stops retrying and marks it stuck — `stuck: true` on the active marker, one `stuck` event, one line. The inbox shows the task as stuck and needing steering, so the change shows once with its trigger, reason, and `osq plan <id>`; `osq --json` gives its `task-dead` item a `stuck` field carrying the fingerprint and gives the change's item a `steering: { trigger, reason }` field; `osq retry <id> <n>` still retries it after you fix the cause outside osq. A task whose active dead reason is `provider_unavailable` is never marked stuck.
- **Steering.** Five failures mean the plan itself is wrong, not the attempt: `stuck` (a task the watcher stopped retrying), `blocked` (a task whose agent wrote `## Blocked`), `regression` (a task or the change failed recertification or archive verification), and two default-branch triggers: `conflict` (osq's merge of the default branch hit a code conflict) and `requirement_changed` (a requirement this change rewrites moved on the default branch). A red verify or check after osq merges the default branch is a `regression` with reason `sync_verify_red`. The watcher's sync before the first task or before archive, and `osq land`, all stop the change on these; `osq land` records an archived change's stop on its branch and refuses to land it until it is steered. The change then shows once in the inbox, with the trigger, its reason, and the one action `osq plan <id>`. That writes the planning prompt into the change's own folder, in its worktree when it runs in one, and quotes each trigger's marker as evidence; `osq plan <id> --session` starts the planner with the worktree root as its working directory. The watcher leaves the change alone while the planner edits it. `osq approve <id>` then lints and seals the revised plan where the change runs, keeps every done task, retires each trigger's marker exactly as `osq retry` does, and continues the run from the first task that is not done. After a `conflict`, approval restarts the branch from the default branch, keeps the old branch as `osq/<folder>-restarted-<n>`, and every task runs again. After `requirement_changed` or `sync_verify_red`, approval merges the default branch into the branch without running verify, keeps done tasks, and judges a revised requirement against the default branch's current text.
- **Scope recertification.** Before each task and again before archiving, the watcher re-hashes the resolved `scope` of every done task. When a later task whose `scope` covers a changed file changed it, the recorded hashes show nothing else did, and the task's `verify` still passes, the watcher recertifies that task by itself. Every other change halts the change until you run `osq retry <id> <n>`. When osq merges the default branch into a change and a done task's verify still passes, the sync recertifies the files only the merge changed.
- **Archive verification.** Before archiving, the watcher re-runs every task's `verify` and the change-level `verify` against the final tree, halting with `.run/regressed/<n>.md` (or `.run/regressed/change.md`) if any fails.
- **State from disk.** The only authoritative state is which marker files exist under `.run/`: `running/<n>.pid`, `done/<n>`, `dead/<n>.md`, `regressed/<n>.md`, and `approved`. There is no in-memory state that matters, so the watcher can be killed and restarted at any time.
- **Executor permissions.** A coding agent may write only `.run/results/<n>.md` and files inside its task's `scope`. It may not edit living capability specs, `tasks.md`, or marker files. The watcher writes markers and checkboxes automatically; a human writes the rest through `osq approve`, `osq retry`, and `osq reject`.
- **Role environments.** osq starts three roles, and none inherits osq's environment. Prepare runs `vcs.prepare`. The agent is the harness process. Verify covers every verify, focused run, mutation check, baseline, format command, and a change's `check` command. Each role gets `PATH`, `HOME`, the locale, temp-folder, and certificate variables, every `OSQ_` variable, and the names the project lists for it under `confinement.roles.<role>.env`. The agent also gets the model key names its harness reads. Verify and prepare never get those, even when listed. A project whose tests need a variable, such as `DATABASE_URL`, must list it, for example `confinement: { roles: { verify: { env: ['DATABASE_URL'] } } }`. Until then those tests fail. See ADR 007.

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
creates:
    - order-cancellation
---
## Goal
## Verify
## Non-goals
## Surface
## Decisions
## Contract
## Human steps
### Before approval
### After landing
## Delta
```

The frontmatter `verify` is the change-level command the watcher runs after every task and before archiving. An optional `fixes` list names the changes this one reworks; lint fails on an id that names no active, archived, or rejected change, and `fixes` never affects execution order. Every change relates to a capability: it writes a delta under `specs/<capability>/spec.md` or names a capability in `features.reads`, and every read names a real capability. A new capability is declared in `creates` in the frontmatter. `osq lint` enforces this once the project has a living capability spec, and `traceability.capabilities` must name real capabilities.

A capability may carry a sidecar, `openspec/specs/<capability>/osq.yml`, holding its `group`, a non-empty string, and optional `tags`, a list of non-empty strings. Nothing else goes in it; a capability's description stays in its spec's `## Purpose`. `osq migrate sidecars` scaffolds `group: ungrouped` at that path for every living capability that has no sidecar, prints `wrote <n> sidecar(s)` plus one `  <capability>` line per file written, and never overwrites an existing sidecar. A change may carry a replacement sidecar at `specs/<capability>/osq.yml` in its own folder; archive copies it over the living one.

A new capability's group is declared in `creates`, as a bare name or as `{ name: <name>, group: <group> }`. A bare name has no group, so `capabilities.requireGroups: true` in `osq.config.ts` makes `osq lint` require one: it fails a `creates` entry with no group or group `ungrouped`, and each capability the change writes a delta for that has no living sidecar or one whose group is `ungrouped`, unless the change carries a replacement sidecar with another group. With `requireGroups` off, a bare name in `creates` and a missing sidecar stay silent; osq's own `osq.config.ts` turns it on.

`## Human steps` holds what osq cannot do. Steps under `### Before approval` show in the approval digest and on the inbox's approval item. Steps under `### After landing` are notes printed by `osq show` and the inbox's land card, and nothing waits on them. A `check: <command>` in the frontmatter runs after the change-level verify at archive and again when `osq land` merges a newer default branch; a failed check stops the change like a failed verify, and its result is a `verify_ran` event. Write `None` under a heading with no steps.

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

Tasks run in order. The agent reads its task, the parent `proposal.md`, the delta specs it names, `AGENTS.md`, and a previous result file for that task if there is one. From the living capability specs it reads only the requirements its task names, through `osq spec <capability> <requirement>`, not whole capability specs. The runner also injects capability-specific constraints and code ownership rules extracted from living capability specs. The delta is applied by the watcher, so the agent never edits living specs under `openspec/specs/`.

Before exiting, the agent writes `.run/results/<n>.md` with these headings, leaving out any that would be empty: `## Changed`, `## Deviated` (for the reviewer), `## Missing context` (for the planner), `## Outside scope` (for the human), `## Blocked`, and `## Next`, ending with a `Touched: <paths>` line. A task that cannot finish within its scope writes what it needs under `## Blocked` and no code; the watcher records it dead with reason `blocked`, never retries it automatically, and the inbox shows the stated need and asks you to steer with `osq plan <id>`. `osq show` prints each task's disclosures, and the plan prompt quotes those from recent archived changes, bounded by `planning.disclosures.recentChanges` (default 3) and `planning.disclosures.maxCharacters` (default 4000).

Lint, run by `osq approve` and `osq lint`. Limits come from `osq.config.ts`; defaults are shown. `osq lint` prints each finding as `<change>: <severity> <file> (<requirement or section>): <message>`, with repository-wide findings in their own group at the end, and `osq lint --json` prints them as JSON.

| Check | Result |
| --- | --- |
| proposal has no `verify` in frontmatter | reject |
| proposal declares `features.writes` | reject |
| more than one table under `## Contract` | reject |
| `depends_on` names a missing change | reject |
| `fixes` names a missing change | reject |
| task `scope` has more than 8 patterns (`limits.maxScopeFiles`) | reject |
| task acceptance longer than 7 lines (`limits.maxAcceptanceLines`), or two lines fused into one | reject |
| task scope names a preexisting test without `tests.modify: true` | reject |
| task `verify` empty or chains commands | reject |
| `verify` is the planning sentinel | reject |
| `verify` names an absent package script | reject |
| `verify` names no existing path or package script | warn |
| a delta targets a requirement the living spec lacks, or is written as an instruction | reject |
| a project with ADRs has no usable `## Decisions` section (`None` with no governing ADR passes) | reject |
| `## Decisions` omits an accepted ADR that governs a capability the change writes | reject |
| the AGENTS.md project rules block is stale or exceeds `limits.maxProjectRules` | reject |
| `## Decisions` names an ADR that does not exist or is not accepted | warn |
| a file contains a prohibited control character | reject |
| OpenSpec schema or validator drift | reject |
| two tasks resolve the same scope file | warn |
| a task scope reaches a preexisting test no task may modify (`limits.importGraphDepth`) | warn |
| a scoped file imports code owned by a capability the proposal neither reads nor has a delta for | warn |
| a scoped file is owned by a capability with no delta in the change | warn |
| a task `verify` runs only tests that import nothing in the task's scope | warn |

`osq init` and `osq new` seed `verify: node -e "process.exit(0)"`. That is a planning sentinel, not trusted coverage: replace it before approval with a command that verifies the completed change's final tree. Checked-in fixtures use a local `node verify.cjs` verifier backed by files in their own execution root, never the sentinel, the network, a TTY, or this repository's full verification suite.

The rules lint can't check live in the managed `PLANNER.md` block: titles read "When X, Y"; every task leaves the change green on its own; a file belongs to one task; approve the task list before writing any task in full.

### Architecture decisions

Architecture decision records live under `paths.decisions` (default `decisions/`). A markdown file there is an ADR when its YAML frontmatter carries `status` (`proposed`, `accepted`, or `superseded`); its number is the leading digits of the file name, its title the first `# ` heading without that number prefix. Only accepted ADRs take effect. An accepted ADR states `applies_to`, either `all` or a list of capability names, and a one-line `rule`; a superseded ADR states `superseded_by`. `limits.maxRuleLength` (default 160) caps a rule's length. A file without frontmatter is ignored and reported.

`osq init` writes the rules block for every accepted system-wide ADR into `AGENTS.md` between `<!-- OSQ:RULES:START -->` and `<!-- OSQ:RULES:END -->`: a `## Project rules` heading and one `- <rule> ADR <number>` line per ADR, in number order. `limits.maxProjectRules` (default 10) caps how many lines the block may hold. The `decisions` check in `osq doctor` validates every ADR, fails on a stale or oversized rules block, warns about ignored files and capability names with no living spec, and warns until an accepted ADR applies to `all`.

When the project has an accepted ADR, every proposal needs a `## Decisions` section after `## Surface`. Name each accepted ADR that governs a capability the change writes, or write `None` when none does. A departure line begins `Departs from ADR <n>:` and gives the reason. `osq lint` and `osq approve` reject a missing or empty section, reject an unnamed governing ADR, and fail while the AGENTS.md rules block is out of date.

An accepted ADR may also name `checks`, the repository-relative test files that enforce it, and `denies`, the package names it forbids. A check path is trimmed, uses forward slashes, and drops a leading `./`; only accepted ADRs' checks and denials take effect. The `decisions` doctor check fails when an accepted ADR names a check file that does not exist. When a task declares `tests.modify: true` and its resolved scope covers an accepted ADR's check file, approval raises one `adr_check_modified` flag labelled `task <n> may modify a check of ADR <number>`, and `osq report` counts it in `approvalFlags.byFlag`.

After an agent exits, the watcher compares each scoped `package.json` against the baseline recorded on the attempt's `measures` start event. A new package appends one `dependencies_added` event; if an accepted ADR denies it, the task dies with `denied_dependency`, eligible for one automatic retry, and the marker names each package, file, ADR, and rule. `osq show` prints a `Dependencies added: <name> (<file>), ...` line under such a task, and `osq report` prints a `Dependencies added:` section with one `<change>: <name> (<file>), ...` line per change that added packages.

### Traceability

Opt a capability in through the `traceability` block in `osq.config.ts`:

```ts
export default defineConfig({
  traceability: {
    capabilities: ['pricing'], // or 'all'
    mode: 'warn',              // or 'require'
    focusedTests: 'node --test --test-reporter=tap {files}', // optional
  },
});
```

The resolved config always holds `traceability`, defaulting to `{ capabilities: [], mode: 'warn' }`. With no capability opted in, `osq init`, `osq lint`, `osq report`, and both managed blocks are exactly what they were, and a project that never imports the helper sees no change.

When at least one capability is opted in, `osq init` writes a `<!-- OSQ:TRACEABILITY:START -->` … `<!-- OSQ:TRACEABILITY:END -->` block directly after the managed block in `AGENTS.md` and `PLANNER.md`. Its scope is `every capability` for `'all'`, otherwise the opted-in names joined by `, `. Removing the opt-in removes the block and restores both files.

A test proves a scenario by importing from `@matteeh/osq/testing`:

```ts
import { scenario } from '@matteeh/osq/testing';

scenario('pricing', 'Volume pricing', { covers: quote }, ({ run, then, each }) => {
  then('the subtotal is 1800.00', () => assert.equal(run(100).subtotal, 1800));
  each('the unit price follows this table', (row) => assert.equal(quote(+row.quantity).unit, +row['unit price']));
});
```

`scenario(capability, name, { covers }, body)` registers one `node:test` test titled `Scenario: <name>`. It fails unless the covered function ran through `run`, every outcome was asserted by a `then` or `each` that completed, and every table row passed. `run` takes the covered function's parameters and returns its result, `then(outcome, check)` asserts one outcome, and `each(outcome, check)` calls the check once per table row, in order, with the row as an object keyed by the header cells. The helper's failure messages are exact: a missing name is `"<text>" is not a THEN of this scenario`; a `then` on a table is `THEN <text>: has a table, so check it with each`; an `each` on a non-table is `THEN <text>: has no table`; a failed check is `THEN <text>: failed` or `THEN <text>: failed at <column> <value>, ...`; a check before the function ran or settled is `THEN <text>: checked before <fn> ran` or `THEN <text>: checked before <fn> settled`; a body that never called `run` is `<fn> never ran`; and a missing assertion is `No assertion for: <text>; <text>`. A lookup failure is reported unchanged.

A scenario with more than one case puts a Markdown table directly under its THEN or AND line, with only blank lines between:

```
- **THEN** the unit price follows this table

  | quantity | unit price |
  | -------- | ---------- |
  | 100      | 9.00       |
  | 500      | 8.00       |
```

The first row names the columns, the dashes row is skipped, and later rows are keyed by the trimmed header cells with trimmed string values. Lint accepts a table under a THEN or AND line in a delta and in a living spec.

Lint reads tags only from a `/** ... */` doc comment directly above `export function`/`export async function`, or `export const <name>` bound to an arrow or function expression. A `@scenario <capability>: <scenario name>` line names a scenario the function serves; `@adr <number>` names a decision it follows. A file is a scenario test file when it imports from `@matteeh/osq/testing`, and its `scenario(` calls are read when capability and name are string literals and the third argument is `{ covers: <identifier> }`; anything else is reported as unreadable as `<file>:<line>: <reason>`.

A task lists the scenarios its tests prove under `## Scenarios`, one `- <capability>: <scenario name>` bullet each. A listed scenario counts as planned while the task's resolved scope holds a test path, so lint passes before the test exists; once a scoped test names it, only real `scenario(...)` calls count.

The watcher sets `OSQ_CHANGE` to the absolute change folder for every verify, so the helper resolves scenarios from the change's delta while it is still active. A `check` command runs as the change-level verify does, without it on an archived change, because its deltas are already in the living spec.

For an opted-in capability, `osq lint` reports each scenario an ADDED or MODIFIED requirement holds that no scoped test names and that is not planned (`<capability>: no test names scenario "<name>"`), a `@scenario` tag naming a missing scenario (`<fn>: names a scenario the <capability> spec doesn't have: "<name>"`) or one no test covers (`<fn>: no test for "<name>" covers it`), a bad `@adr` tag (`<fn>: ADR <n> doesn't exist or isn't accepted`, `<fn>: ADR <n> doesn't apply to any capability it serves`), and a duplicate scenario name (`<capability>: two scenarios named "<name>"`). For every capability it also lists the tests naming a scenario a MODIFIED or REMOVED requirement changes and warns `<file> names changed scenario "<name>" but no task scopes it with tests.modify: true`. Every finding is a warning under `mode: 'warn'` and an error under `mode: 'require'`.

When a capability is opted in, `osq report` prints a `Traceability:` section with `<capability>: <n> untested scenarios, <m> unclaimed functions` and `    untested: <name>` / `    unclaimed: <file>#<name>` lines, also carried in JSON under `traceability`. `osq show` prints `      Scenarios: <capability>: <name>; ...` under a task whose scoped tests name scenarios.

Set the optional `traceability.focusedTests` to a command containing `{files}`, such as the reference `node --test --test-reporter=tap {files}`, to run a task's scenario tests before its full verify. When a task's resolved scope holds scenario test files naming opted-in scenarios, the watcher replaces `{files}` with every scenario test file in the repository that names one of those scenarios, each single-quoted and separated by spaces, and runs it through the verify's environment, `OSQ_CHANGE` included. The outcome is `passed` when the command succeeds, `failed` when the TAP output has a `not ok` line for a collected `Scenario: <name>`, and `problem` when it exits nonzero, times out, or cannot start and isn't `failed`. Only a `failed` outcome ends the attempt: the task dies with `verify_red` and its verify is skipped, so the next attempt receives the focused output; a `problem` or `passed` outcome goes on to the full verify, which alone decides the task. Each run appends one `focused_ran` event carrying the command, files, scenarios, outcome, exit code, duration, timeout state, and output. `osq show` prints `      Focused runs: <outcome> <duration>s, ...` under the task after its `Scenarios:` line, adding ` (attempt ended, verify skipped)` to each `failed` entry.

### Mutation checks

Set the optional `traceability.mutation` block to the project's mutation command
and an optional per-task budget in seconds (default `300`):

```ts
export default defineConfig({
  traceability: {
    capabilities: ['pricing'], // or 'all'
    mode: 'warn',
    mutation: {
      command: 'npx stryker run', // or a command using {mutate}, {tests}, {report}
      budgetSeconds: 300,         // optional
    },
  },
});
```

After a task passes, osq picks the covered functions the task changed or newly tested. A covered function is an exported function carrying a `@scenario` tag naming an opted-in capability whose tagged scenario a scenario test file names. A function is picked when its file is in the task's resolved scope and its own range's hash differs from the task's last start `measures` event's `functionHashes` entry (a missing entry counts as different), or when a scenario test file the task changed covers it.

Each run gets that function's own range plus the range of every non-exported top-level function in the same file it calls, sorted by start line as `<file>:<start>-<end>`, and the sorted, distinct scenario test files naming its tagged scenarios. The command is run once per pick through the verify's environment, `OSQ_CHANGE` included, and receives:

- `{mutate}` and `OSQ_MUTATE`: the ranges, comma-joined for the placeholder and a JSON array for the variable
- `{tests}` and `OSQ_MUTATION_TESTS`: the tests, single-quoted and space-separated for the placeholder and a JSON array for the variable
- `{report}` and `OSQ_MUTATION_REPORT`: an absolute path in a fresh temporary folder, single-quoted for the placeholder

Each run's timeout is the budget left, and picks left once `budgetSeconds` of total wall time for the task is spent are not run. Each pick appends one `mutation_ran` event to the task's stream with `file`, `function`, `ranges`, `scenarios`, `tests`, `outcome`, `killed`, `survived`, `invalid`, `survivors`, `duration`, and `exitCode`. When a pick can't be measured the event says why: `range_unknown` (unknown ranges), `budget`, `timed_out`, `command_failed`, or `report_invalid`; a failed or timed-out run also carries the command's last 2,000 output characters. The check is observe only: it never fails, retries, or halts a task.

`osq show` prints, under a task whose stream holds `mutation_ran` events after its last `measures` start event, `      Mutation: <entry>; <entry>` with one entry per event in stream order. A measured entry is `<file>#<function> <killed> of <killed + survived> killed`, a not-measured one is `<file>#<function> not measured (<reason>)`, and each survivor adds a `        Survived: <file>:<line>:<column> <mutator> -> <replacement>` line. When a capability is opted in, `osq report` prints a `Mutation:` section with `  <capability>: <killed> of <killed + survived> killed (<percent>%), <n> survivors not yet reviewed`, the percent to one decimal, then a `    survived: ...` line per survivor, also carried under `mutation` in JSON. Every listed survivor counts as not yet reviewed.

The reference setup uses StrykerJS with its command test runner. Add `@stryker-mutator/core` as a dev dependency of the project, set `traceability.mutation.command` to `npx stryker run`, and add this `stryker.config.mjs`:

```js
const tests = JSON.parse(process.env.OSQ_MUTATION_TESTS ?? '[]')
  .map((file) => `'build/${file.replace(/\.(m|c)?ts$/, (_, k) => `.${k ?? ''}js`)}'`)
  .join(' ');
export default {
  testRunner: 'command',
  commandRunner: { command: `node --test ${tests}` },
  buildCommand: 'npx tsc',
  mutate: JSON.parse(process.env.OSQ_MUTATE ?? '[]'),
  coverageAnalysis: 'off',
  reporters: ['json'],
  jsonReporter: { fileName: process.env.OSQ_MUTATION_REPORT },
  tempDirName: '.stryker-tmp',
};
```

The config assumes `tsc` compiles `tests/` to `build/tests/`; follow the project's own layout if it differs. Leave `thresholds.break` unset so survivors never change the command's exit code, and add `.stryker-tmp` to `.gitignore`.

### Validator

Set the optional `validator` block to have a second agent judge each change
against its delta specs at archive. It records what it finds and never stops
the change:

```ts
export default defineConfig({
  validator: {
    enabled: true,             // default true when the block is set
    harness: 'claude',         // a harness in the catalog
    model: 'claude-opus-5-5',  // required while enabled
    timeoutSeconds: 900,       // optional, default 900
  },
});
```

The validator runs once per change, after the change-level verify and the
`check`, and before the folder moves to the archive. It is spawned on its own
`harness` and `model`, never the executor's or `OSQ_MODEL`. `osq init` writes
the block commented out, and osq's own config turns it on. While the validator
is enabled and its harness and model match the executor's, `osq doctor` adds a
`validator-model` warning (`validator uses the executor's harness and model
(...); its findings share the executor's blind spots`); it stays a warning so a
project with one provider key can still run.

osq gives it the delta spec paths, the scenarios the change adds or changes,
the patch against the change's base with `openspec/` left out, the tests the
patch adds or changes, and the executor result paths last, labeled as claims to
check. It may read any file in the repository, including tests the change did
not touch, but runs no build or test command and never edits code, tests, or
specs. It reports a finding only for one of three problems:

- `no_code`: no code meets the scenario.
- `no_test`: no test checks its THEN.
- `passes_without_change`: the scenario describes behavior the base did not
  have and its test would still pass on the base.

It says nothing about style, naming, or architecture. Each run appends one
`validator_ran` event to the change's `.run/events/change.jsonl` with outcomes
`validated`, `failed`, `timed_out`, `unreadable`, or `not_run` (reasons
`no_base` when git is off or `.run/base` is missing or empty, `no_scenarios`
when no scenario is judged). Only a `validated` run carries findings; after the
event osq removes `.run/validator/`. Edits the validator makes anywhere else
are put back and listed in the event's `restored`.

`osq show` prints a `Validation:` block after the task section: the headline
`Validation: <outcome> by <harness>/<model> in <duration>s`, the findings for a
validated run, and any `Restored:` paths. `osq report` prints a `Validation:`
section with `<validated> of <changes> changes validated, <findings> findings`
and one line per archived change. Both also carry `validation` in JSON. The
validator is observe only: every outcome is recorded and the archive goes on.
See ADR 010.

## What the watcher guarantees

- **Rebuilt from disk**: State is rebuilt from `openspec/` on every change. Kill it and restart it any time.
- **Single active agent**: One agent per change: locks are created exclusively, and stale locks (dead pid or timeout) are reaped to `dead/`.
- **Approved integrity & Manifest**: What runs is what was approved. `.run/approved` holds a hash of the folder minus `.run/` (with `tasks.md` checkbox state normalized), checked before every spawn. Approval generates `.run/manifest.json` recording hashes of `AGENTS.md`, `PLANNER.md`, configuration, and touched capability specs, along with runtime environment metadata.
- **Stale build detection**: In repository checkouts, the watcher verifies that compiled `dist/` is up-to-date with `src/`. If source files have changed without rebuilding, the watcher refuses to run unless `--allow-stale` or `--dev` is specified. The background service does not refuse: it waits for the build and says so, then restarts on the new build.
- **Prompt rule injection**: Living capability specs declare explicit code ownership (`### Requirement: Code ownership`). The runner extracts these boundaries and injects capability rules directly into the executor prompt.
- **Test modification gating**: Before spawning, the runner snapshots every preexisting file under `tests/`. A changed or deleted one kills the task with `reason: undeclared_test_change` unless the task declares `tests.modify: true` and its scope contains that file. New test files are always allowed.
- **Raw measures events**: Every task start and end emits a `measures` event capturing files/lines under scope, files/lines changed, repository baselines, file import counts, word counts, and requirement/scenario counts.
- **Deterministic spec merges**: Capability specs are only ever changed by the watcher applying an approved delta merge (ADR 002). Agents never touch `openspec/specs/`.
- **Synthesized results**: An agent that exits without writing `.run/results/<n>.md` is not lost: if the adapter captured a final text message, the watcher synthesizes a result file (`synthesized: true`) from it and proceeds to verify. Only an exit with neither a result file nor final text is `dead` with `reason: no_result`. Nothing disappears silently.

Dead reasons: `verify_red` (with `timed_out: true` if verify exceeded its timeout), `change_verify_red`, `verify_precondition`, `baseline_red` (the configured baseline verify failed before the change's first task), `undeclared_test_change`, `verify_path_missing` (a path the task's `verify` names did not exist after the agent exited), `denied_dependency` (a scoped `package.json` gained a package an accepted ADR denies; retried automatically once), `vcs_violation` (an agent in an osq worktree moved git state; kills the task before verify), `scope_violation` (an agent in an osq worktree edited outside its task's scope; kills the task before verify), `blocked` (the agent wrote `## Blocked` in its result; never retried automatically), `no_result`, `crashed`, `timeout`, `provider_unavailable` (the harness was still waiting on a provider retry when the agent ended; retried after a wait on its own budget and never marked stuck), `spec_conflict`, and `already_running`. A done task whose scoped files changed afterwards is recorded under `.run/regressed/<n>.md` with `reason: scope_regression`, and a failed archive-time change verify under `.run/regressed/change.md`; either stops the run before the next task spawns. Every dead marker also carries a `fingerprint` of its reason and body, and a marker the watcher stopped retrying carries `stuck: true`.

## Version control

osq reads git when it is available: `osq doctor` reports it, baseline reuse compares HEAD, and the watcher records `scope_violation` and `vcs_violation` events. Agents never run git. osq makes no git writes unless `vcs.enabled` is true, and it defaults to off.

```ts
export default defineConfig({
  vcs: {
    enabled: false,                  // default; no git writes
    author: 'osq <osq@example.com>', // required when enabled
    // defaultBranch: 'main',        // approval's base branch when origin has no HEAD; default main
    // worktreeRoot: '~/.osq/worktrees',
    // prepare: 'pnpm install',      // run once in each new worktree
  },
  timeouts: {
    gitSeconds: 10,        // each git read
    gitCommitSeconds: 120, // each commit
  },
});
```

With `vcs.enabled`, `osq approve` creates branch `osq/<folder>` and a linked worktree under `vcs.worktreeRoot`, runs `vcs.prepare` there, writes the seal plus `.run/base` and `.run/approver` into the worktree's copy, commits `osq: <id> approved`, and prints `Worktree:` and `Branch:` lines. Approval then removes the change folder from your checkout, unless it is committed there, so the approved change lives only on its branch. The watcher runs the change inside that worktree: before every spawn and archive it checks that HEAD is on `osq/<folder>` and that status lists nothing outside the change folder's `.run/` (and its `tasks.md`), halting with `worktree_off_branch` or `worktree_dirty` otherwise; it commits each verified task as `osq: <id> task <n> verified` and the archive as `osq: <id> archived`; and when a task dies it commits the last verified state plus the dead record and the agent's edits in `.run/dead/<n>.patch`, halting with `commit_failed` when a commit hook rejects a commit. Inside a worktree, a `vcs_violation` or `scope_violation` the git guard records kills the task before verify. An approved change whose `depends_on` names an approved change that has not landed gets a stacked approval under `<vcs.worktreeRoot>/<repo>/.stacked/<folder>` instead of a branch: once the dependency's archive commit exists the watcher cuts the change's branch from it, creates its worktree, and commits its approved copy there. The dependent halts with `dependency_changed` when the dependency is rejected or approved again, with `dependency_diverged` when its dependencies are archived on separate branches, and with `stack_cut_failed` when a cut fails; approving it again starts from the new base. `osq reject` commits the rejection on the change's branch, removes the worktree when it is otherwise clean, and keeps the branch; rejecting a stacked change withdraws its stacked approval and moves the change back into your checkout as a draft (`Restored draft:`). To change a stacked plan, edit it under the stacked directory and run `osq approve <id>` again.

To land a change, run `osq land <id>` from the checkout. It syncs the default branch into the change's worktree when it has moved and runs the change's `verify` there; it builds the land commit from the branch tip's tree, with the default branch as its only parent, and fast-forwards the default branch to it, so the land ends complete or changes nothing. It leaves unrelated uncommitted work in the checkout alone, stops naming any uncommitted file the land writes, and removes the worktree.

```sh
osq land <id>
```

`osq message <id>` prints the land commit's message to stdout and the branch to stderr, and writes nothing. A test that runs inside an `osq/<folder>` worktree finds its change from the worktree's branch when `OSQ_CHANGE` is unset.

Before a change's first task, and again before it archives, when the default branch has moved the watcher merges the default branch into the change's branch and commits `osq: <id> sync <default branch>`. A conflict in a living spec or under the archive directory is resolved from the default branch; a conflict at any other path halts the change with `sync_conflict`. A requirement the default branch changed since the change was approved halts it with `requirement_changed`, and a red verify or check after the merge halts it with `sync_verify_red`. Each is a steering trigger: the inbox asks for `osq plan <id>`, and `osq land` records an archived change's stop on its branch instead of landing it. `osq sync <id>` does the same on request, in the change's worktree, and refuses while a task runs. A stopped `osq sync` halts nothing; it records a `sync_stopped` event, which `osq status` shows.

### Working with version control on

1. Approve the change from the default branch, so osq cuts the `osq/<folder>` branch and its worktree there.
2. Find the worktree at the `Worktree:` line `osq approve` prints, or under `vcs.worktreeRoot`.
3. Leave the worktree alone while a task runs. Approval moved the change folder out of your checkout, so edit a stacked change in its stacked directory and approve it again.
4. Land the archived change with `osq land <id>`. It syncs the default branch into the worktree when it has moved, runs `verify` on the merged tree, builds the land commit from the branch tip, and fast-forwards the default branch to it; the land ends complete or changes nothing.

## Harnesses

`OSQ_HARNESS` picks an adapter. An adapter does two things: spawn an agent for a tier (`coding` or `smart`) and write its harness's config files (`osq setup`). Adapters translate the harness's own event stream into typed events (`started`, `tokens`, `tool`, `text`, `file_changed`, `result_written`, `exited`), and the watcher appends its own, among them `measures`, `verify_ran`, `baseline_ran`, `focused_ran`, `mutation_ran`, `dependencies_added`, `done`, `dead`, `stuck`, `regressed`, `retry`, `recertification`, and `rejected`, to the task's `.run/events/<n>.jsonl`. Change-level events such as `archived`, `check_ran`, and `verification_recorded` go to `.run/events/change.jsonl`; when its sync runs `verify`, `osq land` appends `verify_ran` and `synced` there. Hooks are optional shims that append to the same file. The loop works without them.

Available adapters:

- `agy`: Antigravity harness adapter
- `claude`: Claude Code harness adapter running fresh headless `claude -p` tasks
- `codex`: Codex CLI harness adapter running tasks via `codex exec` and planning via the Codex TUI
- `opencode`: OpenCode harness adapter running tasks via `opencode run` (requires opencode 2)
- `pi`: Pi coding agent harness adapter running fresh one-shot tasks in JSON mode
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
    variant: 'thinking', // optional; passed as <model>#<variant>
  },
});
```

The adapter needs opencode 2; `osq doctor` reports a failing `harness-version` check for opencode 1 and a warning above the tested range. Tasks run with `opencode run --standalone` from the project root, and a configured `variant` is appended to the model as `<model>#<variant>`.

Running `osq setup` with the `opencode` harness scaffolds `.opencode/agent/osq-coder.md` with restricted permissions (denying `webfetch` and `websearch`) and the managed `AGENTS.md` execution procedure. Note that the `--auto` flag approves any action the agent file does not deny. The agent file must have mode `all` or `primary`; a subagent cannot be selected with --agent and OpenCode silently falls back to an unrestricted default. `webfetch` and `websearch` are denied at the tool level, but `bash` is allowed and unrestricted, so the agent can reach the network through the shell. Network isolation requires a sandbox, which osq does not provide.

### Antigravity (agy)

Select Antigravity as the executor in `osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: 'agy',
  // agy: { dangerouslySkipPermissions: true }, // required for headless tasks
});
```

Setting `OSQ_HARNESS=agy` in the environment or `.env` also selects agy, but an explicit `harness` in `osq.config.ts` wins over that fallback.

#### agy permissions

agy asks before every tool call by default. A headless task cannot answer those prompts, so agy auto-denies the call and the watcher refuses to start before any task spawns. Set `agy: { dangerouslySkipPermissions: true }` in `osq.config.ts` to have agy approve every tool call and run headless; `osq doctor` then reports a `harness-containment` warning saying that nothing stops git, network tools, or sudo. Interactive planning with agy needs no bypass, because a human answers the prompts.

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

### Pi

`osq init` scaffolds pi as the default harness. Select Pi as the executor in `osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: 'pi',
  pi: {
    // All fields are optional; omit any of them to use Pi's native value.
    // bin: '/path/to/pi',      // pi.bin -> OSQ_PI_PATH -> `pi`
    // provider: '<provider>',  // required only to run `pi auth check` before execution
    // model: '<your-model>',   // pi.model -> OSQ_MODEL (Pi executor only) -> native
    // thinking: '<effort>',    // pi.thinking -> native default
  },
});
```

Setting `OSQ_HARNESS=pi` in the environment or `.env` also selects Pi, but an explicit `harness` in `osq.config.ts` wins over that fallback. Binary precedence is `pi.bin`, then `OSQ_PI_PATH`, then `pi` on `PATH`. Model precedence is `pi.model`, then `OSQ_MODEL` only when Pi is the executor, then Pi's native default; with no model configured, osq records `default` rather than guessing one. `pi.thinking` is passed as Pi's `--thinking` level and recorded as the execution effort, or null when unset.

Install Pi with `npm install -g @earendil-works/pi-coding-agent`. This release is tested against `>=0.87.0 <0.88.0`; `osq doctor` reports a `harness-version` warning and the watcher warns at preflight when the installed version falls outside that range, but neither fails. When `pi.provider` is set, preflight runs `pi auth check --provider <name> --json` and fails before any task spawns unless the status is `ready`; `osq doctor` reports the same as its `harness-auth` check.

#### Pi setup and prerequisites

`osq setup` writes no Pi files, because Pi reads `AGENTS.md` itself, so the shared managed executor protocol reaches it without a harness-specific config. Pi loads only the first of `AGENTS.override.md`, `AGENTS.md`, and `CLAUDE.md` in each directory, so an `AGENTS.override.md` in your project would shadow the managed `AGENTS.md` and hide the executor protocol; do not add one if you want Pi to follow osq.

#### Pi permissions

Each task is a fresh noninteractive process in the project root with stdin closed. osq passes `--mode json --no-session --no-approve --offline --no-extensions --no-skills --no-prompt-templates`, then `--provider`, `--model`, and `--thinking` for the settings you configured, then `--` and the executor prompt as one literal argument. Extensions, skills, and prompt templates are off, so no consumer-supplied Pi customization runs. Pi applies no filesystem sandbox and asks no permission prompts, and its network access stays open. `osq doctor`'s `harness-containment` line states plainly that nothing confines the agent.

As with every harness, scope is a protocol, not confinement: the prompt and the watcher's checks restrict the agent to its declared files, but they do not confine the filesystem or network beyond what Pi itself enforces. osq does not provide OS or container isolation.

Pi cannot plan: the adapter has no interactive session, so `osq plan --session` with Pi selected as the planner stops with the existing "does not support interactive sessions" error, and `planner.agent` is unsupported for Pi and rejected by configuration validation.

### Claude Code

Select Claude Code as the executor in `osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  harness: 'claude',
  claude: {
    // All fields are optional; omit any to use Claude Code's native value.
    // bin: '/path/to/claude',  // claude.bin -> `claude`
    // model: '<your-model>',   // claude.model -> OSQ_MODEL (Claude executor only) -> native
    // sandbox: true,           // confine Bash with Claude Code's OS sandbox (needs bubblewrap and socat)
  },
});
```

Setting `OSQ_HARNESS=claude` in the environment or `.env` also selects Claude Code, but an explicit `harness` in `osq.config.ts` wins over that fallback. Binary precedence is `claude.bin`, then `claude` on `PATH`. Model precedence is `claude.model`, then `OSQ_MODEL` only when Claude Code is the executor, then Claude Code's native default; with no model configured, osq records `default` rather than guessing one. This release requires Claude Code `2.1.278` or newer, the version every flag below was verified on; `osq doctor`'s `harness-version` check and the watcher's preflight both fail under it.

Each task is a fresh `claude -p --output-format stream-json --verbose` process in the project root with stdin closed and `--no-session-persistence`, so there is no session to resume.

#### Claude Code setup and prerequisites

Install the Claude Code CLI and log in as usual: by default osq reuses your Claude Code login. When `ANTHROPIC_API_KEY` is set to a non-empty value, osq adds `--bare` and uses the key instead; `--bare` never reads your login, which is why it is tied to the key. The `started` event records which one ran through `harnessAuth`: `api_key` with a key and `login` otherwise.

`osq setup` writes no Claude Code files for execution; it only maintains the shared managed `AGENTS.md` block. Planning with Claude Code uses the tool-native `/osq-plan` command that `osq init` installs, not this adapter.

#### Claude Code stripped tool surface

Each task loads only six built-in tools: `Bash`, `Read`, `Edit`, `Write`, `Glob`, and `Grep`. osq passes `--tools Bash,Read,Edit,Write,Glob,Grep`, `--strict-mcp-config` with no `--mcp-config`, `--disable-slash-commands`, `--setting-sources ""`, `--no-session-persistence`, and `--settings '{"autoMemoryEnabled":false}'`. That strips MCP servers, skills, plugins, hooks, user, project and local settings, saved sessions, and auto-memory so the agent pays no tokens for harness features a coding task never uses: measured on a one-line prompt, input fell from about 29,500 to about 13,300 tokens per request. No configuration key re-enables any of them.

#### Claude Code permissions

Executor tasks run with `--permission-mode dontAsk`, so anything not allowed is denied rather than prompting. `Read`, `Glob`, and `Grep` are allowed; `Edit` and `Write` are confined to the project through `Edit(./**)` and `Write(./**)`; `Bash` is allowed but `git` is denied by `Bash(git:*)`. `curl`, `wget`, `ssh`, `scp`, and `sudo` are denied the same way by `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`, `Bash(scp:*)`, and `Bash(sudo:*)`, which still deny them inside compound commands such as `echo a && git status`.

Without `claude.sandbox`, Bash is not confined: a shell command can still write outside the project or reach the network. Set `claude.sandbox: true` to add Claude Code's Bash sandbox with no network. It fails at startup if the sandbox is unavailable instead of running unconfined, and on Linux and WSL2 it needs the OS packages `bubblewrap` and `socat` (`apt install bubblewrap socat`).

As with every harness, scope is a protocol, not confinement beyond what the harness itself enforces.

## Commands

The groups below match the groups `osq --help` prints.

**Everyday**

```
osq                      human attention inbox: needs you, running, landed since last look
osq --json               print human attention inbox as stable JSON
osq inbox                what needs a human; opens as cards on a terminal, prints otherwise
osq inbox --follow       print new and departed items as they change, and sound when new work appears
osq inbox --json         the dispatch queue and every item's card data as JSON
osq plan [name]          create a change, write plan-prompt.md, and hand off to your planning tool
osq approve <ids...>     lint, print the digest, approve change; write .run/approved and .run/manifest.json
osq land <id>            land an archived change onto the default branch
osq retry <id> <target>  retry a dead or regressed task, or a change-level regression
osq reject <id>          move an unapproved or failed change intact into rejected history
```

**Setup and running**

```
osq init                 scaffold openspec layout, config, AGENTS.md, PLANNER.md, and the Claude plan command
osq init --refresh-schema  overwrite the six scaffolded OpenSpec schema files from the installed templates
osq setup                write harness config for OSQ_HARNESS
osq watch                run the watcher loop
osq server start         run the dashboard and the watcher service in the background
osq server stop          stop the server and the watcher service
osq mcp --cwd <dir>      serve the planning tools to an MCP client over stdio
```

**Inspection**

```
osq status               overview of all changes, tasks, and runtime states
osq show <id>            change details, tasks, results, dead markers, and event timeline (--json for JSON)
osq report               delivery metrics, completion rates, failure reasons, durations, and costs
osq query [select]       run one read-only SELECT over the history tables (--json for JSON)
osq digest [ids...]      deterministic Markdown or JSON digest of archived changes (--since, --until, --json, --out, --no-cost)
osq spec [capability] [requirement]  list living capabilities, list a capability's requirements, or print one requirement
osq graph                print the system graph summary (node, edge, and gap counts)
osq graph --json         print the system graph as JSON
osq serve [--port <n>]   local delivery dashboard on 127.0.0.1 that can approve, land, reject and retry (--open to launch it)
osq serve --export <dir> write a static dashboard snapshot to <dir> and exit
osq doctor               validate repository health, harness availability, and pinned validator
```

**Plumbing**

```
osq new <name>           new change folder from template in openspec/changes/
osq lint [ids...]        validate change folders and OpenSpec artifacts against constraints (--json for JSON, --repository for findings about other changes)
osq queue                print the read-only brief queue from openspec/queue.md
osq sync <id>            merge the default branch into a change's branch
osq message <id>         print an archived change's land commit message
osq migrate openspec     migrate a legacy osq layout to the canonical openspec/ layout
```

### Approval

```sh
osq approve <id> --confirm      # show the digest, then ask about any flags before sealing
osq approve <id> --base-ok      # approve even when HEAD is not the default branch
osq approve <id> --ignore-dirty # approve despite uncommitted changes in task scope
osq show <id> --json            # details, tasks, events, and the digest as JSON
```

By default `osq approve` prints the digest and its flags, then approves without
asking; flags never block. `--confirm` asks only when flags fire, defaults to no,
and refuses without a terminal rather than waiting. A declined or refused approval
writes nothing, and `--confirm` on a flag-free change approves without a prompt.
With `vcs.enabled`, approve normally requires HEAD on the default branch and a
clean checkout in task scope; `--base-ok` and `--ignore-dirty` override those
two refusals.
`osq show <id> --json` prints the same details as JSON, with the digest and flags
for an unapproved change and a null digest once it is approved.

### Human Attention Inbox

Running bare `osq` serves as the entrypoint for human attention:

- **Needs you**: unapproved proposals, active dead tasks, active regressed tasks, and change-level regressions, each ending with its exact action command (`osq approve <id>`, `osq plan <id>`, `osq retry <id> <n>`, or `osq reject <id> --reason <text>`). A change that needs steering — a stuck or blocked task, or a regression — shows once, with the trigger, its reason, and `osq plan <id>`, and its item in `osq --json` carries a `steering: { trigger, reason }` field. A dead task the watcher stopped retrying shows as stuck, and its `task-dead` item in `osq --json` carries an optional `stuck` field (`stuck: { fingerprint }`) that no other item has.
- **Running**: actively executing tasks with verified live PID, start time, and elapsed duration.
- **Landed since last look**: changes archived strictly after your project's previous look (tracked per project in `~/.osq/last-look/`), or the newest 10 on first look.

Use `osq --json` to consume this contract programmatically without extra terminal formatting.

`osq inbox` is the dispatcher view: it lists the items that need a human — an
unapproved change ready for approval, a dead or regressed task, a change-level
regression, and an archived change waiting to land —
then prints the first item's card with its reason, evidence, and exact commands.
It orders the queue by taking approval and halt items first while the watcher is
idle, then the item that holds up the most changes, then the lower change id and
task number. `osq inbox --json` carries every item's card data.

On a terminal, `osq inbox` opens the first item as a card instead of printing:
the same header and card, then a `Keys:` block with `a` approve, `p` plan,
`r` retry, `x` reject (it asks for a reason), `s` show, `n` skip, and `q` quit.
Pressing a key runs that osq command inside the same `osq inbox` process on the
same terminal, so on failure it prints the command's own error message and its
next step before the exit code, and the terminal stays usable after any action.
A key only runs a command the card already lists; `osq land <id>` gets no key,
so it appears under `Run yourself:` to copy rather than run. When
stdout is not a terminal, or with `--json` or `--follow`, `osq inbox` prints as
before, so piping and scripts are unaffected.

`osq inbox --follow` prints the same text, then
`Waiting for new items (Ctrl-C to stop).`, and keeps running until you press
Ctrl-C. It watches the change trees and re-derives the queue every
`inbox.pollSeconds` as a safety net, printing one `<HH:MM> + <item>` line per
item that appears and one `<HH:MM> - <item>` line per item that goes away. It
plays one sound when a batch adds at least one item, never for a departure and
never for the items already present at start. The sound is `sounds/inbox.wav`
from the package by default, played through `afplay` on macOS and the first of
`pw-play`, `paplay`, and `aplay` on Linux; when no player is found, or the
configured file is missing, it falls back to the terminal bell. Nothing the
watcher does makes a sound. The optional `inbox` block tunes it:

- `inbox.sound`: `default`, meaning the packaged WAV, or `bell`, `off`, or a
  sound file path relative to the project root.
- `inbox.quietHours`: `null` to always play, or `HH:MM-HH:MM` local time to stay
  silent in that window, start inclusive and end exclusive, wrapping midnight.
- `inbox.soundWindowSeconds`: `5`, the least seconds between two sounds.
- `inbox.eventDebounceMs`: `200`, how long change events batch before one
  re-derivation.
- `inbox.pollSeconds`: `30`, how often the safety-net poll re-derives the queue.

The card session and `osq inbox --follow` append to a per-project wait log
under `~/.osq/inbox/`, keyed by the project's real path: when each item was
first seen, when its card opened, when it went away, and whether the watcher
had runnable work at each of those moments. An item already waiting when an
inbox starts, or gone while none ran, is marked as unobserved. The one-shot
`osq inbox` and `osq inbox --json` write nothing; they only read the log. The
dispatch order breaks ties by first-seen time before change id.

`--follow` refuses `--json`; it is a text view.

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
lifetime and records any matches as observed planning sessions. Each session is
cut into per-turn slices, so one long session planning several changes is no
longer counted once per change. Every turn goes to exactly one change: a turn
that edits a change folder belongs to it, and any other turn goes to the next
change edited before the next approval, or else to the change approved next.
Per-turn tokens are what each reader actually reports — Claude Code message
usage, Codex `token_count`, and OpenCode messages — and input excludes cached
input. A Claude `cost-state` cost counts only for a slice that holds the whole
session. osq never estimates missing values, never retains transcript content,
and never sends anything off the machine.

The `planning.idleGapMinutes` and `planning.prices` keys are configured in
`osq.config.ts`:

```ts
import { defineConfig } from '@matteeh/osq';

export default defineConfig({
  planning: {
    idleGapMinutes: 10, // a longer gap between turns is not active planning
    prices: {
      // USD per million tokens; osq ships no price table of its own.
      '<provider>/<model>': { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
});
```

A slice gets a price-table cost only when every turn's model is priced and
reported input and output tokens.

### Retry & Rejection

```sh
osq retry <id> <task>           # retry a dead task or recertify a regressed one (e.g. osq retry 042 1)
osq retry <id> change           # clear an active change-level regression after fixing root cause
osq reject <id> --reason <text> # move an unapproved or failed change to openspec/changes/rejected/
```

### Watcher options

```sh
osq watch                # run watcher event loop continuously
osq watch -o, --once     # process all queued approved tasks and exit
osq watch --dev          # reactive dev mode running directly from src/ via tsx with auto-restart
osq watch --allow-stale  # allow running from repository checkout when dist/ is older than src/
osq watch --background   # run the watcher as a background service
osq watch --stop         # stop the background service
osq watch --verbose      # enable verbose execution logging
osq watch -q, --quiet    # suppress info and verbose output
```

`osq watch --background` starts the watcher as a detached service and returns.
The service runs the watcher as a child, restarts it after a crash and on a
new osq build between tasks, waits instead of exiting when `dist/` is older
than `src/`, and never builds osq itself. Its records and log live under
`~/.osq/watch/`, and `osq status` prints the log's path. `osq watch --stop`
signals the service to stop; it waits for the running task to finish first.

### Metrics & Reporting

```sh
osq report               # formatted terminal report
osq report --json        # raw JSON report for scripting and CI pipelines
osq report --since <date> --until <date>  # limit the Inbox waiting section's period
osq digest <ids...>      # digest the archived changes with those ids
osq digest --since <date> [--until <date>]  # digest every change archived in the range
osq digest --json        # print the versioned digest JSON document
osq digest --out <file>  # write the digest to a file instead of stdout
osq digest --no-cost     # leave cost and executor models out
```

`osq digest` reads only archives and the decisions folder, runs no model, and prints the same bytes for the same archives and arguments. It prints Markdown by default, JSON with `--json`, and writes to `--out <file>` instead of stdout. `--no-cost` omits cost and models.

`osq query "<select>"` answers questions about archived changes as rows: which tasks died and why, which changes touched a requirement, what executors disclosed, and which notices each archived or rejected change recorded. It runs one read-only `SELECT` over the tables `changes`, `requirements`, `tasks`, `dead_attempts`, `disclosures`, and `notices`; `osq query` alone lists them and their columns, and any other statement is refused. Add `LIMIT` to keep the answer short.

`osq report` and `osq query` read archived event streams through a SQLite index at `.osq/index.sqlite`, rebuilt per file when a file's size or modification time changes. The files stay the only source of truth: deleting the index, or a corrupt one, changes nothing but the next run's speed (ADR 008).

`osq report`'s `Inbox waiting` section shows, for its period, how long each
approval, halt, and land item waited, the time the watcher sat idle on
a human's item, and how many items each card session handled; `--since` and
`--until` choose that period.

`osq report` renders completion rate, failures by reason, execution durations, token usage, and file changes. The `Planning by change` section shows each change's sessions, tokens by kind, cost, active minutes, spec words, changed lines, and spec words per changed line, plus the minutes from its last planning edit to approval; active minutes sum the gaps between a slice's turns and leave out any gap longer than `planning.idleGapMinutes`. The `Planning vs execution` section compares planning and executor tokens and cost. Reported cost sums the `cost` values carried by harness events, and any cost that no attempt or session reported reads `not reported` instead of a dollar amount. Reported cost reflects the harness's internal price table rather than the invoice. The `Approval flags` section counts, per flag and for changes that recorded none, how many changes fired it and how many later had trouble (a dead task or a regression), split by whether the flags were only shown or confirmed with `--confirm`; it counts only changes approved after this release, because older manifests carry no recorded flags and are skipped. The `Automatic retries` section counts automatic and manual retries, how many of the attempts they opened reached done, the `stuck` events, and the harness-reported cost of those attempts.

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

The dashboard is one hash-routed page: `#/report` renders delivery
charts, `#/graph` renders the capability archive graph, and `#/changes/<key>`
renders detailed change evidence. Every request recomputes its document from
the current filesystem and keeps no cache, and the page treats filesystem
notifications only as a signal to refetch. It uses system fonts, same-origin
requests, and no external asset, and respects `prefers-color-scheme`.

From the change view, `osq serve` can approve, land, reject and retry. A tap
runs the same command function `osq approve`, `osq land`, `osq reject` and
`osq retry` run, in the server process, and shows the exit code, output, error
and next step. It refuses every write that does not carry an allowed loopback
`Host` and `Origin`, a JSON content type, and the per-server token, and it runs
one action at a time. `osq serve` is otherwise for local inspection only: no
authentication, no remote binding, and no hosting story. It never starts the
execution watcher or writes a project, cursor, or marker file except through an
action the dashboard asked for. SIGINT and SIGTERM close the HTTP listener and
its filesystem watcher. Startup failures such as an address already in use
print one actionable error and exit nonzero.

### Planning through MCP

`osq mcp` serves the planning tools to an MCP client over stdio, so a planner
can plan a change with the client's own model while every file it writes stays
inside one unapproved change folder. Point the client at the project folder:

```json
{
  "mcpServers": {
    "osq": {
      "command": "osq",
      "args": ["mcp", "--cwd", "<project>"]
    }
  }
}
```

For Claude Code, run `claude mcp add osq -- osq mcp --cwd <project>`. To plan
against a server, add `OSQ_SERVER=https://<host>/p/<project>/` to the client's
environment; `plan` downloads the change's working copy, the file tools edit
it, and `lint` uploads it. The tools are `plan`, `list_files`, `read_file`,
`write_file`, `edit_file`, `delete_file`, `spec`, `query` and `lint`, and they
write only inside one unapproved change folder. `approve`, `land`, `reject`
and `retry` are not tools; approval stays with a human.

### Running osq on a server

`osq server start` runs the dashboard and the watcher service in the
background for the server's own clone, and `osq server stop` stops both. The
server binds only `127.0.0.1` on `serve.server.port`. Reach it over a private
network with `tailscale serve --bg <port>` after adding the tailnet name to
`serve.allowedHosts`, or with `ssh -L <port>:127.0.0.1:<port> <server>`, then
open `/p/<project>/`. Tailscale Serve or a reverse proxy terminates TLS; osq
never does. Anyone who reaches the port through the private network can tap,
because there is no sign-in yet. A land tapped there pushes to `origin` with
the server user's git or SSH credentials, which no executor or verify
receives, and stops when `origin` moved. `osq land` in a terminal does not
push, and `osq serve` is unchanged.

To use the server from a laptop, export
`OSQ_SERVER=https://<tailnet name>/p/<project>/` in the shell that runs `osq`.
Every command then runs on the server and prints the same output and exit code
it prints locally. `init`, `setup`, `migrate`, `watch`, `serve`, `doctor`,
`inbox` and `server` stay local, and each says so in one line unless you unset
`OSQ_SERVER`. A planner sets `OSQ_SERVER` in the shell or editor that starts
it: `osq plan <id>` downloads the change's working copy under
`~/.osq/remote/` for the planner to edit, and `osq lint <id>` uploads it and
lints on the server. Unsetting `OSQ_SERVER` returns the shell to local use.

## Diagnostics & Health

Run `osq doctor` to verify repository health:

- `config`: confirms `osq.config.ts` is valid and well-formed
- `harness`: checks that the configured harness binary (e.g. `opencode`, `agy`) exists and is executable
- `harness-version`: the installed harness's version. Pi warns outside its tested range; Claude Code fails under `2.1.278`; opencode fails under 2 and warns from 3
- `harness-auth`: with Pi and `pi.provider` set, fails unless `pi auth check` reports `ready`
- `harness-containment`: doctor reports it for every harness, stating what confines the agent. It fails for agy without `agy.dangerouslySkipPermissions: true`, and warns for agy with it or for an opencode agent other than `osq-coder`
- `decisions`: validates every ADR, the AGENTS.md rules block, and each accepted ADR's check files
- `planning-prices`: warns, only when it applies, that a model with recorded planning tokens has no price in `planning.prices`
- `git`: git's version, or a warning saying why git is off. `git-env` warns when a variable such as `GIT_DIR` is set
- `vcs-prepare`, `git-hooks`, `git-signing`: with `vcs.enabled` only, warn about a lockfile without `vcs.prepare`, active commit hooks, and commit signing
- `managed-blocks`: verifies the `AGENTS.md`, `PLANNER.md`, and `.claude/commands/osq-plan.md` managed sections match the installed osq version (run `osq init` to repair drift)
- `locks`: checks for orphaned `.run/running/*.pid` locks and processes
- `archives`: validates integrity of archived change folders
- `done-markers`: flags any done marker in an active change that neither the watcher nor an older osq wrote when marking a task done by hand
- `validator`: ensures `@fission-ai/openspec` is installed and matches the pinned version (`1.13.1`)

## Release Procedure

To release a new version of `osq`:

1. Bump `"version"` in `package.json`.
2. Add a corresponding release section in `CHANGELOG.md`.
3. Commit the changes: `git commit -am "chore: release <x.y.z>"`.
4. Create and push the release tag: `git tag v<x.y.z> && git push --tags`.
5. GitHub Actions (`release.yml`) verifies the build and publishes to npm with provenance via trusted publishing.

## Status

Early. Written in TypeScript so `npx` is the whole install and the glue (spawning, JSON streams, file watching, git) stays short; the filesystem protocol means the watcher could be rewritten in another language later without consumers noticing. Numbers in `osq.config.ts` are guesses until `osq report` says otherwise. See `decisions/` for why things are the way they are.

MIT.
