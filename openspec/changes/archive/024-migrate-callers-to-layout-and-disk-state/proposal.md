---
title: "Migrate remaining consumers to canonical layout and dual-signature state derivation"
depends_on: ['023']
features:
  reads:
    - cli-foundation
    - watcher-and-harness
  writes:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Resolve the build breaks introduced by the R1 layout and R5 snapshot refactorings in change `023`:
1. **Dual-Signature `deriveSpecState`**: Provide an overloaded signature in `src/core/state.ts` allowing `deriveSpecState` to evaluate synchronously and purely when passed a `ChangeFolderSnapshot`, while asynchronously reading from disk via `deriveSpecStateFromDisk` when passed `(projectRoot: string, folderPath: string)`.
2. **Migrate Inspection & Reporting Modules**: Update `src/core/status.ts`, `src/core/show.ts`, and `src/core/report.ts` to derive change and archive paths via `getChangesDir` and `getArchiveDir` from `src/core/layout.ts` rather than removed config properties.
3. **Migrate Workflow & Scaffolding Modules**: Update `src/cli/lint.ts`, `src/core/approve.ts`, `src/core/linter.ts`, and `src/core/new.ts` to consume `src/core/layout.ts` helpers.
4. **Migrate Archiving & Diagnostic Modules**: Update `src/watcher/archiver.ts`, `src/core/doctor.ts`, and `src/core/migrate.ts` to eliminate obsolete `config.paths.specs` and `config.paths.archive` references.
5. **Align Test Suites**: Update remaining unit tests asserting legacy path fields (`cut-over.test.ts`, `archiver.test.ts`, `watcher.test.ts`, `watcher-preflight.test.ts`, etc.) so that `pnpm tsc --noEmit && pnpm test && pnpm lint` all pass cleanly.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| `deriveSpecState(snapshot)` | Synchronously and purely evaluates state without filesystem access |
| `deriveSpecState(projectRoot, folderPath)` | Asynchronously reads folder snapshot from disk and resolves spec state |
| `osq status`, `show`, `report` execution | Resolves change folders and archives through `src/core/layout.ts` anchored to `openspecRoot` |
| `osq doctor` execution | Inspects change and archive paths derived from layout without referencing removed properties |
| `pnpm tsc --noEmit` | Compiles with 0 TypeScript diagnostics across all source and test modules |

## Non-goals

- Re-introducing `specs` or `archive` to `OsqPaths`.
- Modifying harness adapters or event recording streams.
- Altering the approval sealing algorithm or verification gates.

## Human steps

None.

## Delta

This change completes consumer cut-over to canonical OpenSpec path layout in `specs/cli-foundation/spec.md`, and backward-compatible state derivation with watcher layout in `specs/watcher-and-harness/spec.md`.
