# osq

CLI and watcher for spec-driven development with coding agents.

pnpm, TypeScript strict, Node 22+. No framework. Zero runtime dependencies beyond `chokidar`, `yaml`, `commander`, and `jiti`; propose an ADR before adding one.

## Layout

```
src/cli/         one file per command. thin: parse args, call core, print.
src/core/        code grouped by the capability that owns it:
  foundation/    cli-foundation
  lifecycle/     watcher-and-harness
  run/           watcher-and-harness
  spec/          spec-lint-and-approve
  report/        metrics-and-reporting
  status/        status-inspection
  web/           web-inspection
src/watcher/     event loop. calls core, owns all marker writes.
src/harness/     one adapter per harness. spawn + setup + event translation only.
  agy/ claude/ codex/ opencode/
  index.ts mock.ts process.ts stream.ts types.ts
templates/       files `init` copies. owned by the consumer after copy.
fixture/         tiny fake repo used by tests. Each fixture root has a local `verify.cjs`.
tests/
```

A file lives in the folder of the capability that owns it.
`tests/line-budget.test.ts` caps source files at 250 lines; only its explicit allow list is exempt.
`tests/function-budget.test.ts` caps functions at 80 lines; only its explicit grandfather list is exempt.

## Principles

- The filesystem is the protocol. State is marker files under `.run/`. Events are append-only jsonl. No in-memory state that matters; the watcher must survive a restart. Any index or cache is derived from the files and may be deleted at any time.
- Single writer. Only the watcher writes markers. Only `osq approve` writes `approved`. Agents write `results/` and nothing else.
- Trust nothing an agent says. `done` requires the watcher's own `verify` run.
- Living capability specs change only when the watcher applies an approved delta.
- Adapters vary spawn, setup, and event translation. If you want to add a method to the adapter interface, first prove the harness really differs.
- Every lint limit and timeout comes from `osq.config.ts`. No numbers in code.
- Nothing in `src/` knows about any consumer project.

## Verify

```
pnpm tsc --noEmit && pnpm test && pnpm lint
```

Tests run against `fixture/`. A test that needs a real model is an integration test, marked and skipped by default.

Tests that submit fixture changes to lint or approval use a local `node verify.cjs` verifier backed by files in their own execution root, never the planning sentinel, the network, a TTY, or this repository's full verification suite.

## OpenSpec layout

- Living capability specs live under `openspec/specs` as `<capability>/spec.md`.
- In-flight changes live under `openspec/changes/<id>-<slug>/`.
- The change document is `proposal.md`; delta specifications live beside it as `<capability>/spec.md`.
- `.run/` markers track execution state: `running/<n>.pid`, `done/<n>`, `dead/<n>.md`, `regressed/<n>.md`, and `approved`.
- Two gates: the approval gate (`osq approve`, run by a human, writes `.run/approved`) and the verification gate (the watcher runs each task's `verify` before writing `done`).
- State is derived purely from the marker files on disk; nothing depends on in-memory state.

## Executing a spec

1. Read your task file, its parent `proposal.md`, then only the delta specs and capability docs it names. Nothing else.
2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside `scope`.
6. Run the task's `verify` command before exiting.

## Exiting

Write `.run/results/<n>.md` first: changed, deviated, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Do not ask questions. An agent writes only `.run/results/<n>.md` and files inside `scope`; it never edits living capability specs, `tasks.md`, or marker files.

## Writing specs

Interactive sessions only. Read recent archived changes first. Use the templates. Rules are in README.md. Approval is `pnpm osq approve`, run by a human.

<!-- OSQ:START -->
## Executing a spec

1. Read your task file, its parent `proposal.md`, then only the delta specs and capability docs it names. Nothing else.
2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside `scope`.
6. Run the task's `verify` command before exiting.

## OpenSpec layout

- Living capability specs live under `openspec/specs/` as `<capability>/spec.md`.
- In-flight changes live under `openspec/changes/<id>-<slug>/`.
- The change document is `proposal.md`; delta specifications live beside it as `<capability>/spec.md`.
- The osq workflow schema lives under `openspec/schemas/osq/` (proposal -> specs -> tasks).
- `tasks/<n>.md` is the osq execution unit; `tasks.md` is a write-only projection of `.run/` state.
- `.run/` markers track execution state: `running/<n>.pid`, `done/<n>`, `dead/<n>.md`, `regressed/<n>.md`, and `approved`.
- State is derived purely from the marker files on disk; nothing depends on in-memory state.

## Gates and executor permissions

- Approval gate: only `osq approve`, run by a human, writes `.run/approved` after linting and hashing the change.
- Verification gate: the watcher alone re-runs each task's `verify` against the final tree before writing `done`.
- An agent writes only `.run/results/<n>.md` and files inside `scope`; it never edits living capability specs, `tasks.md`, or marker files.

## Planning a change

- When asked to plan a change, read `plan-prompt.md` in the selected change
  folder and follow it exactly.
- Write only inside that change folder.
- Run `osq lint <slug>` and fix every finding before you finish.
- Never run `osq approve`; approval belongs to a human.

## Exiting

Write `.run/results/<n>.md` first: changed, deviated, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Do not ask questions.
<!-- OSQ:END -->
