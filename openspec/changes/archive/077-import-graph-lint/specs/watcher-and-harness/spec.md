# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Import fan-in from the shared graph
<!-- source: src/watcher/measures.ts, src/core/spec/import-graph.ts, tests/import-graph-build.test.ts, tests/measures.test.ts -->
`countImportFanIn` SHALL count the `src/**/*.ts` files outside the scope that
import a scoped file under `src/`, read from `buildImportGraph`. It SHALL match
whole import specifiers, so an importer of `./codex-prompt.js` does not count
toward `./codex.ts`.

#### Scenario: Prefix-named sibling
- **WHEN** `src/x.ts` imports `./codex-prompt.js` and scope is `src/codex.ts`
- **THEN** `src/x.ts` does not count toward the fan-in

#### Scenario: osq's own repository
- **WHEN** fan-in is counted on this repository for a sample of `src/` files
- **THEN** each count equals a search for whole import specifiers
