---
title: The dashboard and osq docs show one page per capability and per ADR
depends_on: []
verify: pnpm verify
creates:
  - name: docs
    group: inspection
features:
  reads: [cli-foundation, metrics-and-reporting, spec-lint-and-approve, status-inspection, traceability]
---
## Goal

A new developer, human or agent, has no single place to learn what a
capability promises. The facts exist: each living spec has its Purpose,
requirements and Code ownership, `readDecisions` reads the ADRs, the system
graph holds the traceability links, and the archive records which changes
touched which capability. But they are spread over `osq spec`, `osq graph`,
`osq query` and the files, and the dashboard shows none of them.

With this change, osq builds one page model per capability and one per ADR
from those sources, and renders it twice. The dashboard gets a Docs section,
and `osq docs [--out <dir>]` writes the same pages as Markdown. A capability
page holds the spec's opening text, each requirement's SHALL sentence and
scenario names, the accepted ADRs that bind it, its Code ownership, a code map
for capabilities opted in to traceability, and the last five changes that
touched it. An ADR page holds its frontmatter, full text and the capabilities
it applies to, and a superseded ADR links to its successor. Nothing is
stored, so the pages cannot drift.

The code lives in a new `docs` capability, `src/docs/`, the first slice in
`SLICES` (ADR 016). It registers its config block and command through
`slice.ts`.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new docs model, command,
endpoint and view tests, plus `tests/line-budget.test.ts`, which holds
`src/core/web/web-server.ts` to 250 lines), and lint, on the final tree.

## Non-goals

- Prose written by a model (`docs-narration`).
- API reference from types.
- Docs in the static dashboard export (`osq serve --export`); `osq docs`
  covers offline reading.
- Rendering ADR or spec Markdown as HTML in the dashboard; ADR bodies show as
  preformatted text, so no package is added.
- Forwarding `osq docs` to a server; with `OSQ_SERVER` set it still runs
  locally, like every slice command today.

## Surface

- Added: capability `docs`, group `inspection`, in `src/docs/`.
- Added: command `osq docs [--out <dir>]`, in the `Inspection` help group and README's Inspection block.
- Added: config block `docs` with `recentChanges`, default 5.
- Added: endpoint `GET /api/docs`.
- Added: dashboard `Docs` link and routes `#/docs`, `#/docs/capabilities/<name>` and `#/docs/adrs/<number>`.

## Decisions

- ADR 013: `/api/docs` is a read-only GET in the existing document table; it adds no write path.
- ADR 016: `docs` is a new slice in `src/docs/` with its own `slice.ts`, registered in `SLICES`; `slice.ts` loads the command code through `import()` and reaches `config.ts` only through type imports.

## Assumptions

- `docs/osq` is a sensible default for `--out`. osq owns the `capabilities/` and `adrs/` folders under it and removes stale `.md` files there, so a renamed capability leaves no old page.
- Building the site takes about 6 seconds on this repository (3.9 s for `getSystemGraph`, 2.1 s for `listArchivedChanges`, measured 2026-10-11). The dashboard loads it once per docs visit and again only on a `changed` event, so no cache is added.
- "Recent" means by change number, newest first. Old archived changes have no `archived` event, so they show as `undated`.
- A prototype with the slice registered, the command, `/api/docs`, the route and the nav link broke only `tests/line-budget.test.ts` (`web-server.ts` at 251 lines). Help, README command, slice registry and UI tests passed unchanged.

## Contract

The docs and web-inspection deltas below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/docs/spec.md`: new capability `docs`, ADDED "Code ownership", "Docs configuration", "Capability page model", "ADR page model", "Docs site model", "Docs command".
- `specs/docs/osq.yml`: group `inspection`.
- `specs/web-inspection/spec.md`: ADDED "Docs document", "Docs view".

No file is shared between tasks. Tasks 2 to 5 import `tests/docs-support.ts`,
which task 1 owns, without editing it. Task 3 imports `src/docs/docs-config.ts`
from task 1 and task 4 imports `src/docs/docs-site.ts` from task 2, without
editing them.
