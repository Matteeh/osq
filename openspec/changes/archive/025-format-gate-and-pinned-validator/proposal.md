---
title: "Format gate completion: ADR 004, pinned validator diagnostics, schema
  hardening, and setup coexistence"
depends_on:
  - "024"
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

Fulfill all requirements of the Format Gate between Phase 0 and Phase 1:
1. **ADR 004 (Pinned OpenSpec Validator)**: Formally record the architectural decision for `@fission-ai/openspec` (exact version `1.13.1`), how the pin is verified, how doctor reports drift, and how updates are governed.
2. **Doctor Validator Pin Diagnostics**: Add a 6th health check to `osq doctor` verifying the installed validator matches the pinned version, reporting `[ok] validator: pinned 1.13.1` or failing with drift details.
3. **Schema Execution Authority Instructions**: Update `templates/openspec/schemas/osq/schema.yaml` instructions so any agent reading generated OpenSpec skills is told that tasks are executed only by `osq watch`, archiving is owned exclusively by `osq` (never `openspec archive`), and `tasks.md` checkboxes are strictly runner-written projections to prevent bypassing the approval hash.
4. **Setup Block Coexistence in `AGENTS.md`**: Update `osq setup` and `updateManagedBlock` so that the `<!-- OSQ:START -->` block is written/refreshed in `AGENTS.md` without disturbing `<!-- OPENSPEC:START -->` blocks, verified by a test asserting both blocks survive repeated setups.
5. **Canonical Migration Path Resolution**: Refactor `src/core/migrate.ts` so `src/core/layout.ts` is the single authority for resolving change, spec, and archive paths.

## Contract

| Component / Trigger | Expected Output / Behavior |
|---|---|
| ADR 004 accepted | `decisions/004-pinned-openspec-validator.md` exists and is indexed in `decisions/README.md` |
| `osq doctor` on healthy checkout | Emits `[ok] validator: pinned 1.13.1` as part of repository health diagnostics |
| `osq doctor` on validator version drift | Emits `[fail] validator: openspec version <ver> differs from pinned 1.13.1` and exits 1 |
| Agent reading schema instructions | Informed that tasks execute only via `osq watch`, archive is osq's, and checkboxes are runner-written |
| `osq setup` repeated on `AGENTS.md` | Both `<!-- OSQ:START -->` and `<!-- OPENSPEC:START -->` blocks remain intact and uncorrupted |
| `osq migrate openspec` path resolution | Resolves all directories strictly through `src/core/layout.ts` helpers |

## Non-goals

- Upgrading `@fission-ai/openspec` beyond version 1.13.1.
- Removing or bypassing the independent verify runner gate or approval hash algorithm.
- Introducing external network fetches during doctor or lint validation.

## Human steps

None.

## Delta

This change establishes ADR 004, doctor validator pin verification, schema execution authority instructions, setup block coexistence, and canonical migration layout resolution.