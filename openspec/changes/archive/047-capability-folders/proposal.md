---
title: Capability folders
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

Make the codebase navigable for a fresh, cheap agent. Remove the one piece of
code that breaks silently when files move, add a function-length ratchet next
to the existing file-length budget, and fold the flat `src/core/` and
`src/harness/` directories into folders named after the capability that owns
each file. Behaviour, export names, CLI output, and `dist/` entry points do not
change. Files are moved, never renamed.

## Verify

`pnpm verify`

The complete suite proves the package-root resolution, every moved import, the
public entry point, the import-graph tier rules, the file line budget, the new
function budget, the UI build, and lint without a network service, TTY, or real
model.

## Non-goals

- Splitting any grandfathered file or function.
- Renaming any file. `config-codex.ts` stays `config-codex.ts` inside
  `foundation/`.
- Moving tests, `packages/ui/`, `src/cli/`, or `src/watcher/`. Their import
  specifiers change; their locations do not.
- Lazy-loading commands in `src/cli/index.ts`.
- Changing any behaviour, export name, CLI output, or `dist/` entry point.
- Editing living capability specs. The `<!-- source: -->` comments outside
  `Code ownership` are rewritten by a human after archive.
- Removing entries from the line-budget `ALLOW_LIST`.
- Changing `src/core/config.ts`'s jiti resolution base. `loadConfig` passes an
  absolute config path to `jiti.import`, so the base passed to `createJiti`
  does not decide which file loads, and the consumer config resolves its own
  imports relative to itself. The existing config-loading tests cover this
  after the move.

## Contract

### Requirement: Single package-root module

Core code SHALL obtain the package root and the templates root only from
`package-root.ts`, which exports `PACKAGE_ROOT` and `TEMPLATES_ROOT` computed
once from its own file location. No other file under `src/core/` SHALL compute
a path from `import.meta.url` with `new URL(...)`. Existing exports named
`TEMPLATES_ROOT` from `init.ts` and `new.ts` remain available.

#### Scenario: Roots resolve to the package
- **WHEN** `package-root.ts` is imported under tsx or from the compiled `dist/`
- **THEN** `PACKAGE_ROOT` contains `package.json` and `TEMPLATES_ROOT` contains `PLANNER.md`

#### Scenario: A second location-dependent module appears
- **WHEN** any other file under `src/core/`, at any depth, combines `new URL(` with `import.meta.url`
- **THEN** the package-root test fails naming that file

### Requirement: Capability folders

Every file under `src/core/` SHALL live in the folder of the capability that
owns it: `foundation/`, `lifecycle/`, `spec/`, `report/`, `status/`, `run/`, or
`web/`. Every harness-specific adapter file SHALL live in
`src/harness/<harness>/`; `index.ts`, `mock.ts`, `process.ts`, `stream.ts`,
and `types.ts` stay at `src/harness/`. `src/index.ts` SHALL export exactly the
same names as before the move.

#### Scenario: Moves keep the suite green
- **WHEN** the moves land
- **THEN** `pnpm verify` passes with `tests/import-graph.test.ts` and `tests/line-budget.test.ts` unchanged except for import specifiers

#### Scenario: No flat core module remains
- **WHEN** `src/core/` is listed after the moves
- **THEN** it contains only the seven capability folders and no `.ts` file

### Requirement: Function length budget

`tests/function-budget.test.ts` SHALL fail when a function in `src/` spans more
than `MAX_LINES` (80) lines, counting function declarations, methods, and arrow
or function expressions assigned to a `const`, from the node's first line to
its last. The only exceptions are an explicit grandfather list keyed
`<path relative to src>#<functionName>`. A grandfather entry that no longer
names an over-budget function SHALL also fail, so the list only shrinks.

#### Scenario: New long function
- **WHEN** a non-grandfathered function spans 81 lines
- **THEN** the suite fails with a message naming the key, its line count, and the budget

#### Scenario: Grandfathered function
- **WHEN** a grandfathered function exceeds the budget
- **THEN** the suite passes

#### Scenario: Stale grandfather entry
- **WHEN** a grandfathered key names a function that is missing or within budget
- **THEN** the suite fails naming the stale key

## Human steps

- Review the proposal, the six capability deltas, and the three task bodies,
  then run `pnpm osq approve 047` yourself.
- The watcher halts twice for scope recertification. That is expected: every
  later task changes files inside an earlier task's scope. When task 2
  completes, task 1 is marked regressed; run `pnpm osq retry 047 1`. When task
  3 completes, task 2 is marked regressed because `tests/**` gained
  `tests/function-budget.test.ts`; run `pnpm osq retry 047 2`.
- Before the next publish, run `rm -rf dist && pnpm build`. `tsc` does not
  delete the old flat `dist/core/*.js` and `dist/harness/*.js` files, and the
  package's `files` list ships all of `dist`.
- After archive, run a scripted old-path to new-path rewrite over the
  `<!-- source: -->` comments in `openspec/specs/*/spec.md` using the mapping
  below. The `Code ownership` comments are already rewritten by the deltas.
  `src/core/**` and `src/harness/**` stay as written.

### Path mapping

Every entry maps `src/core/<name>.ts` or `src/harness/<name>.ts` to the folder
shown, keeping the file name.

| New folder | Files |
|---|---|
| `src/core/foundation/` | config, config-codex, config-doctor, config-gates, config-queue, config-serve, harness-catalog, logger, init, init-blocks, init-managed, new, doctor, doctor-managed, package-root |
| `src/core/lifecycle/` | retry, reject, done |
| `src/core/spec/` | parser, linter, approve, hasher, delta, migrate |
| `src/core/report/` | report, report-events, planning, planning-observed, planning-records |
| `src/core/status/` | status, show, state, layout, inbox, inbox-cursor, inbox-projection, queue, queue-parser, queue-planning, queue-report, queue-report-detail, queue-state |
| `src/core/run/` | lock, manifest, scope, scope-hash, verification, summary |
| `src/core/web/` | web-data-change, web-data-folders, web-data-graph, web-data-lifecycle, web-data-observations, web-data-tokens, web-data-types, web-data, web-events, web-server, web-static |
| `src/harness/codex/` | codex, codex-prompt, codex-stream, codex-usage, codex-observe-usage |
| `src/harness/opencode/` | opencode, opencode-usage, opencode-observe-usage |
| `src/harness/agy/` | agy |
| `src/harness/claude/` | claude-usage |

Globs in the source comments:

| Old | New |
|---|---|
| `src/core/config*.ts` | `src/core/foundation/config*.ts` |
| `src/core/queue*.ts` | `src/core/status/queue*.ts` |
| `src/core/inbox*.ts` | `src/core/status/inbox*.ts` |
| `src/core/web*.ts` | `src/core/web/web*.ts` |
| `src/core/web-data*.ts` | `src/core/web/web-data*.ts` |
| `src/core/web-server*.ts` | `src/core/web/web-server*.ts` |
| `src/harness/codex*.ts` | `src/harness/codex/codex*.ts` |
| `src/harness/opencode*.ts` | `src/harness/opencode/opencode*.ts` |

## Delta

All six capability deltas modify only `### Requirement: Code ownership`: the
`<!-- source: -->` list and the scenario's path list name folders instead of
files. Every `SHALL` sentence is unchanged.

- `specs/cli-foundation/spec.md` owns `src/core/foundation/**` plus its existing
  CLI, template, and guidance paths.
- `specs/spec-lint-and-approve/spec.md` owns `src/core/spec/**`.
- `specs/metrics-and-reporting/spec.md` owns `src/core/report/**`.
- `specs/status-inspection/spec.md` owns `src/core/status/**`.
- `specs/watcher-and-harness/spec.md` owns `src/core/run/**` and
  `src/core/lifecycle/**`, plus `tests/done-manual.test.ts`. `retry.ts`,
  `reject.ts`, and `done.ts` mutate `.run/` execution state and append
  lifecycle events, which this capability already contracts, and it already
  owns their tests. CLI Foundation keeps the command entry points through
  `src/cli/**`.
- `specs/web-inspection/spec.md` owns `src/core/web/**`.

While this change is in flight, the runner injects the living ownership rules,
which still name the old flat paths. Every task body states that its `scope`
is authoritative over injected ownership rules.

Shared files: task 2 rewrites the import specifiers of the files task 1
creates and edits (`src/core/package-root.ts`, the five core consumers, and
`tests/package-root.test.ts`) and moves them. Tasks 1 and 3 each create one new
test file under `tests/`, which task 2's `tests/**` scope covers. No other file
is shared.

## Follow-ups

- 048 split `report.ts` along its numbered sections into `src/core/report/`.
- 049 split `linter.ts` into verify-command, openspec-validator, artifact-scan,
  delta-targets, lint-change.
- 050 split `show.ts`.
- 051 add pi as a harness via RPC (`src/harness/pi/`), with `harness/types.ts`
  split around what pi's event stream provides.
- 052 lazy-load CLI commands in `cli/index.ts` and shrink `createProgram`.
- 053 mirror `tests/` to `src/` with a shared root helper.

Each removes its entries from both grandfather lists.
