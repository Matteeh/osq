---
title: Serve export
depends_on:
  - '056'
verify: pnpm verify
features:
  reads:
    - web-inspection
    - cli-foundation
---
## Goal

This is the last of four dashboard changes. `osq serve --export <dir>` writes
a static snapshot of every dashboard view that any static file host can serve,
with no osq process behind it. That is the fastest route to a demo people can
open.

The UI already supports it. When `window.__OSQ_DATA__` holds a route's
documents, that route renders without a fetch or an events connection. The
export writes the built UI, a `data.js` that sets `window.__OSQ_DATA__` to every
document (report, graph, inbox, and each change), and an `index.html` that
loads it first. Asset paths become relative, so the snapshot works from any
static host, including under a subpath such as GitHub Pages' `/<repo>/`.
Browsers refuse to load the UI's module script from `file://`, so opening
`index.html` straight from disk is not supported.

A snapshot publishes whatever `.run/` holds, including verify output with
absolute paths. Before writing, the export replaces the project root with `.`
and the home directory with `~` in every string. That is all it scrubs: verify
output can still contain secrets, hostnames, or customer data, so the human
steps say to read an export before publishing it.

## Verify

`pnpm verify`

The suite exports a fixture project into a temporary directory. It checks that
every view's documents are present, that change pages resolve by folder key
and by id, that no absolute project or home path remains in any written file,
and that the command refuses a non-empty target. It also checks the
built UI's relative asset paths and that the served dashboard still works. It
needs no network service, TTY, or real model.

## Non-goals

- Scrubbing anything beyond the project root and home directory paths.
- Hosting, uploading, or publishing the export.
- Live updates in the export. It is a snapshot.
- Starting a server while exporting. `--export` writes and exits.
- Opening the export from `file://`, which would need a non-module build.

## Surface

- Added: `osq serve --export <dir>` (flag).

## Contract

### Requirement: Static dashboard export

`osq serve --export <dir>` SHALL write a self-contained snapshot of every
dashboard view to an empty or missing `<dir>`, with the project root and home
directory replaced in every inlined string, and SHALL exit without serving.

#### Scenario: Export served statically
- **WHEN** a project with archived and active changes is exported and the directory is served by a static host
- **THEN** `<dir>/index.html` loads `data.js` and the built assets through relative paths, and the documents cover home, changes, report, graph, and every change

#### Scenario: Paths are scrubbed
- **WHEN** a task result or verify output contains the absolute project path and home directory
- **THEN** no file in `<dir>` contains either absolute path

## Human steps

- Review the proposal, both deltas, and both task bodies, then run
  `pnpm osq approve 057` yourself after 056 archives.
- Before publishing any export, read it. The scrub covers the project root and
  home directory only.

## Delta

- `specs/web-inspection/spec.md` adds `Static dashboard export`.
- `specs/cli-foundation/spec.md` adds `Serve export flag`.

Task 1 owns the export core and the Vite base. Task 2 owns the CLI flag and the
README. No file belongs to two tasks.
