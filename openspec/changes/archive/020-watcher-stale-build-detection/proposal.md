---
title: Watcher stale build detection, build identity recording, and dev mode
depends_on: ['019']
features:
  reads:
    - cli-foundation
    - watcher-and-harness
  writes:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Enable the `osq watch` loop to detect and record its active build version and commit/hash, refuse to run on stale compiled output when executed from a repository checkout, and provide a reactive `--dev` mode that runs directly through `tsx` from `src/` and restarts gracefully upon source file changes after completing the active task.

1. **Build Identity Recording**: In every `started` lifecycle event (`event.data`) and in the idle status line, record the `osq` package version and the active git commit SHA (falling back to a SHA-256 hash of `dist/` when git is not available).
2. **Stale Build Preflight Check**: When `osq watch` starts from a checkout (detected by the presence of `src/` under the package root) rather than an installed package, compare the newest modification time (`mtime`) under `src/` against the newest modification time under `dist/`. If source is newer than `dist/` (or `dist/` does not exist), print exactly one error line and exit non-zero (code 1) unless `--allow-stale` is passed.
3. **Reactive Dev Mode (`--dev`)**: In `--dev` mode, execute through `tsx` from `src/` directly and watch `src/` for file changes. When a file under `src/` changes, allow any currently running task to finish first before restarting the loop with the updated code.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| Checkout startup with `src/` newer than `dist/` | Prints single line to stderr: `osq build is stale: src/ is newer than dist/. Run 'npm run build' or pass --allow-stale.` and exits with code 1 |
| Checkout startup with `--allow-stale` | Bypasses stale build preflight check; continues starting watcher |
| Installed package startup (no `src/`) | Bypasses stale build check; continues starting watcher |
| Lifecycle `started` event (`event.data`) | Includes `version` (e.g. `'0.1.0'`) and `commit` (git commit SHA or fallback hash of `dist/`) |
| Watcher idle status line | Formats idle status prefixed with `osq v<version> (<commit>) · watching <dir> · <n> approved waiting · <last>` |
| `osq watch --dev` startup | Runs through `tsx` from `src/`, bypassing stale `dist/` check |
| Source change in `--dev` mode during task execution | Allows current running task to finish verification and outcome recording, then restarts the watcher loop |
| Source change in `--dev` mode while idle | Restarts the watcher loop immediately |

## Non-goals

- Modifying harness adapters (`src/harness/**`) or report metrics generation (`src/core/report.ts`).
- Altering the approval hash algorithm or task directory structure.
- Introducing new external runtime dependencies.

## Human steps

None.

## Delta

This change introduces build identity metadata, stale build preflight detection, and reactive dev mode loop execution via capability delta specifications in `specs/cli-foundation/spec.md` and `specs/watcher-and-harness/spec.md`.
