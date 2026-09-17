# osq

CLI and watcher for spec-driven development with coding agents.

pnpm, TypeScript strict, Node 22+. No framework. Zero runtime dependencies beyond `chokidar`, `yaml`, and `commander`; propose an ADR before adding one.

## Layout

```
src/cli/         one file per command. thin: parse args, call core, print.
src/core/        state derivation, transitions, lint, lock, reaper. pure where possible.
src/watcher/     event loop. calls core, owns all marker writes.
src/harness/     one adapter per harness. spawn + setup + event translation only.
templates/       files `init` copies. owned by the consumer after copy.
fixture/         tiny fake repo used by tests. verify is `node -e "process.exit(0)"`.
tests/
```

## Principles

- The filesystem is the protocol. State is marker files under `.run/`. Events are append-only jsonl. No in-memory state that matters; the watcher must survive a restart. Any index or cache is derived from the files and may be deleted at any time.
- Single writer. Only the watcher writes markers. Only `osq approve` writes `approved/`. Agents write `results/` and nothing else.
- Trust nothing an agent says. `done` requires the watcher's own `verify` run.
- Feature docs change only when the watcher applies an approved delta.
- Adapters vary spawn, setup, and event translation. If you want to add a method to the adapter interface, first prove the harness really differs.
- Every lint limit and timeout comes from `osq.config.ts`. No numbers in code.
- Nothing in `src/` knows about any consumer project.

## Verify

```
pnpm tsc --noEmit && pnpm test && pnpm lint
```

Tests run against `fixture/`. A test that needs a real model is an integration test, marked and skipped by default.

## Executing a spec

This repo uses osq on itself. Same procedure as any consumer.

1. Read your task file, its parent `spec.md`, then only the docs listed under `features`. Nothing else.
2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside `scope`.
6. Full gate once, above.

## Exiting

Write `.run/results/<n>.md` first: changed, deviated, drift against `features/`, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Never write to `features/`, `tasks.md`, or anything in `specs/` outside `.run/results/`. Do not ask questions.

## Writing specs

Interactive sessions only. Read `specs/dead/` first. Use the templates. Rules are in README.md. Approval is `pnpm osq approve`, run by a human.
