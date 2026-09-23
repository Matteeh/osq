# osq

CLI and watcher for spec-driven development with coding agents. A planner writes
a change folder, a human approves it, and the watcher hands one task at a time
to an executor.

**Planning a change? Follow `PLANNER.md`.** This file describes the codebase and
the executor protocol.

pnpm, TypeScript strict, Node 24+. No framework. Runtime dependencies are
`chokidar`, `yaml`, `commander`, and `jiti` only; adding one needs an ADR in
`decisions/`.

## Layout

```
src/cli/          one file per command. thin: parse args, call core, print.
src/core/         code grouped by the capability that owns it:
  foundation/     cli-foundation
  lifecycle/      watcher-and-harness
  run/            watcher-and-harness
  spec/           spec-lint-and-approve
  report/         metrics-and-reporting
  status/         status-inspection
  web/            web-inspection
src/watcher/      event loop. calls core, owns every automatic marker write.
src/harness/      one adapter per harness. spawn + setup + event translation only.
  agy/ claude/ codex/ opencode/
  index.ts mock.ts process.ts stream.ts types.ts
src/index.ts      public configuration exports.
packages/ui/      read-only browser dashboard; `scripts/stage-ui.mjs` copies its build to `ui/dist`.
templates/        files `init` copies. owned by the consumer after copy.
openspec/         living capability specs, in-flight changes, and the archive.
decisions/        architecture decision records.
fixture/          tiny fake repo used by tests. Each fixture root has a local `verify.cjs`.
tests/
```

A file lives in the folder of the capability that owns it; ownership is each
capability's `Code ownership` requirement in `openspec/specs/<capability>/spec.md`.
`tests/line-budget.test.ts` caps source files at 250 lines; only its explicit allow list is exempt.
`tests/function-budget.test.ts` caps functions at 80 lines; only its explicit grandfather list is exempt.

## Principles

- The filesystem is the protocol. State is marker files under `.run/`. Events are append-only jsonl. No in-memory state that matters; the watcher must survive a restart. Any index or cache is derived from the files and may be deleted at any time.
- Writers are fixed. The watcher writes `.run/` markers. A human writes `approved`, retries, rejections, and manual `done` through the CLI. An executor writes only `.run/results/<n>.md` and files inside its task's `scope`.
- Trust nothing an agent says. `done` requires the watcher's own `verify` run.
- Living capability specs change only when the watcher archives an approved change and applies its deltas.
- Adapters vary spawn, setup, and event translation. If you want to add a method to the adapter interface, first prove the harness really differs.
- Every lint limit and timeout comes from config (`DEFAULT_CONFIG` merged with `osq.config.ts`). No numbers in code.
- Nothing in `src/` knows about any consumer project.

## Verify

```
pnpm verify
```

That runs the CLI and UI typechecks, the build, every test, and lint.

Tests run against `fixture/`. A test that needs a real model is an integration test, marked and skipped by default.

Tests that submit fixture changes to lint or approval use a local `node verify.cjs` verifier backed by files in their own execution root, never the planning sentinel, the network, a TTY, or this repository's full verification suite.

<!-- OSQ:START -->
## Executing a task

You were handed one task, `tasks/<n>.md`, from a change under `openspec/changes/`.

1. Read your task file, its parent `proposal.md`, then only the delta specs and capability specs it names. Nothing else.
2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Write only `.run/results/<n>.md` and files inside the task's `scope`; the task's `scope` wins over any other ownership rule you were given.
6. New test files are always allowed. Change a preexisting test only when the task sets `tests.modify: true` and the file is inside `scope`; any other test change kills the task.
7. Run the task's `verify` command before exiting. Then run the proposal's `verify`; the watcher runs both itself and kills the task if either fails.

## Exiting

Write `.run/results/<n>.md` first, with these headings in this order. Leave out any that would be empty.

- `## Changed`: what you changed.
- `## Deviated`: where you departed from the task, and why.
- `## Missing context`: what you needed that the task files did not give you.
- `## Next`: for unfinished work, the acceptance line to pick up next.

End the file with one line, `Touched: <path>, <path>`, listing every file you changed other than the result file, relative to the project root.

Then exit. One attempt. Do not ask questions.

## Where things live

- Living capability specs live under `openspec/specs/` as `<capability>/spec.md`. Never edit them; the watcher applies approved deltas at archive.
- In-flight changes live under `openspec/changes/<id>-<slug>/`: `proposal.md`, delta specs as `specs/<capability>/spec.md`, and one `tasks/<n>.md` per task.
- `tasks.md` and every file under `.run/` except your result file belong to the watcher and the human. Never edit them.
- Approval gate: only `osq approve`, run by a human, writes `.run/approved`. Verification gate: only the watcher's own `verify` run marks a task done.

## Planning a change

Planners follow `PLANNER.md`. When `osq plan` started you, `plan-prompt.md` in the selected change folder is your complete prompt; read it and follow it exactly.

- Write only inside that change folder.
- Run `osq lint <slug>` and fix every finding before you finish.
- Never run `osq approve`; approval belongs to a human.
<!-- OSQ:END -->
