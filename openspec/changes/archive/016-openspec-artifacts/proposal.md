---
title: OpenSpec artifacts and profile integration
depends_on:
  - 15
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - spec-lint-and-approve
    - metrics-and-reporting
    - status-inspection
---
## Goal

Enable `osq` to read and write OpenSpec artifacts natively without intermediate translation, ship an `osq` OpenSpec schema, and keep its execution runtime (approval hash, `.run/` state, verification gate, dead letter queue, archive, metrics) entirely its own. After this change, `osq` is literally a stricter profile of OpenSpec, and `openspec validate --strict` runs as part of `osq lint` and `osq approve`.

1. **OpenSpec Layout & Profile**: Transition living docs from `features/<name>.md` to `openspec/specs/<capability>/spec.md` across the same five capabilities (`cli-foundation`, `metrics-and-reporting`, `spec-lint-and-approve`, `status-inspection`, `watcher-and-harness`). Active changes transition from `specs/<NNN>-<name>/` to `openspec/changes/<NNN>-<name>/`, and archive from `specs/archive/<NNN>-<name>/` to `openspec/changes/archive/<NNN>-<name>/`, retaining 3-digit numeric IDs.
2. **Proposal and Delta Specs**: In change folders, `spec.md` becomes `proposal.md` carrying `title`, `depends_on`, and `features.reads` (dropping `features.writes`). Prose `## Delta` sections become OpenSpec delta specs at `specs/<capability>/spec.md` using `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, and `## RENAMED Requirements` with `### Requirement:` blocks and `#### Scenario:` WHEN/THEN bullets.
3. **OpenSpec Config & Schema**: Ship `openspec/config.yaml` declaring `schema: osq`, context, and per-artifact rules. Ship `openspec/schemas/osq/schema.yaml` forked from `spec-driven` with artifact order `proposal` → `specs` → `tasks` (`design` dropped). Document in schema README that `tasks/<n>.md` sits outside the schema graph as an osq-specific execution unit.
4. **Pinned Validator Integration**: Exact-pin `@fission-ai/openspec: "1.13.1"` in `devDependencies` and declare `>=1.13.1 <2` in `peerDependencies`. `osq lint` shells out to `node_modules/.bin/openspec validate --changes --strict --json --no-interactive` and `openspec validate --specs --strict --json --no-interactive` under `OPENSPEC_TELEMETRY=0`, surfaces findings under an `openspec:` prefix, logs the resolved version, and warns once if it differs from 1.13.1.
5. **Deterministic Delta Application**: Watcher delta application becomes a deterministic merge into `openspec/specs/<capability>/spec.md`: `ADDED` appends, `MODIFIED` replaces matching `### Requirement:` blocks, `REMOVED` deletes them, and `RENAMED` rewrites headers. Unmatched `MODIFIED` or `REMOVED` references fail at approval lint time.
6. **Write-Only Checkbox Projection**: Checkbox updates in `tasks.md` upon verify pass are strictly write-only projections; runtime state remains 100% derived from `.run/`.
7. **Migration & Cut-Over**: Provide `osq migrate openspec` to migrate legacy archives and active specs, tick all archived tasks, preserve prose deltas under `## Delta (legacy)`, and test against fixture and real archive copies. The layout cut-over is the final task, instructing the human to stop watcher, migrate, and restart.

## Contract

| Trigger / Action | Expected Behavior |
|---|---|
| `osq init` | Scaffolds `openspec/config.yaml`, `openspec/schemas/osq/schema.yaml`, `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/`, and updated `AGENTS.md` |
| `osq new <name>` | Prepares next 3-digit padded change folder (`openspec/changes/<id>-<slug>/`) with `proposal.md`, `tasks.md`, and `tasks/1.md` |
| `osq lint [id]` / `osq approve <id>` | Runs `openspec validate` with `--strict`, `--json`, `--no-interactive` and `OPENSPEC_TELEMETRY=0`; prefixes findings with `openspec:`; verifies delta target existence against base specs |
| Independent verify pass | Runner writes `.run/done/<n>` and ticks `- [x] <n>` in `tasks.md` as a write-only projection |
| Spec archival | Applies delta specs into `openspec/specs/<capability>/spec.md` deterministically; moves folder to `openspec/changes/archive/<id>-<slug>`; passes `openspec validate --archived` |
| `osq migrate openspec` | Moves legacy features to `openspec/specs/`, changes to `openspec/changes/`, archive to `openspec/changes/archive/`, renames `spec.md` to `proposal.md` with `## Delta (legacy)`, and ticks all archived `tasks.md` checkboxes |

## Non-goals

- Adopting OpenSpec date prefixes for changes (numeric IDs are retained for dependency tracking and repair references).
- Calling `openspec archive`, `openspec apply`, or any writing OpenSpec CLI commands.
- Deriving runtime or task completion state from `tasks.md` checkboxes.
- Modifying the zero-trust independent verification gate or `.run/` directory structure.

## Human steps

Upon completion of Task 9 (Cut-over):
1. Stop the running watcher process (`Ctrl+C`).
2. Run the migration command from repository root:
   ```bash
   osq migrate openspec
   ```
3. Restart the watcher:
   ```bash
   osq watch
   ```

## Delta (legacy)

This change establishes OpenSpec artifact compatibility and migrates living documentation from `features/*.md` to `openspec/specs/<capability>/spec.md` via this change's own delta specifications in `specs/<capability>/spec.md`.
