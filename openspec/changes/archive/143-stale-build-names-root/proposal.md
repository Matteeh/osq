---
title: The stale-build line names the osq install it means
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - version-control
---
## Goal

The stale-build refusal names the osq package root it checked, so a person
running a linked osq checkout from another project can tell it is osq's own
build that is stale, not their project.

Today the line is `osq build is stale: src/ is newer than dist/. Run 'npm run
build' or pass --allow-stale.` Run from a consumer project, `src/` and
`npm run build` read as the consumer's own. It happened on 2026-10-03: a
project depending on `@matteeh/osq` `^0.2.2` printed the line because bare
`osq` on PATH was a `pnpm link` of the osq checkout, whose `dist/` was older
than its `src/`.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint. The new
`tests/stale-build-root.test.ts` proves the line carries the package root
through `findStaleBuild` and through the watcher's start check, and the
updated stale tests prove `osq land` and the in-run check print it unchanged.

## Non-goals

- Changing when a build counts as stale, or the `--allow-stale` and `--dev` bypasses.
- Changing the build command the line suggests.
- Warning when bare `osq` on PATH differs from the project's installed version.

## Surface

- Changed: the stale-build line printed by `osq watch`, `osq land`, and the watcher's in-run check now reads `osq build is stale: src/ is newer than dist/ in <package root>. Run 'npm run build' there or pass --allow-stale.`

## Decisions

- ADR 002: unaffected; archive applies this delta like any other.

## Contract

### Requirement: The stale line names the package root

`findStaleBuild` SHALL return `osq build is stale: src/ is newer than dist/ in
<package root>. Run 'npm run build' there or pass --allow-stale.`, where
`<package root>` is the absolute package root it compared, and every place
that prints the stale line SHALL print that exact text.

#### Scenario: Linked checkout run from another project
- **WHEN** `findStaleBuild` runs with a package root whose `src/` is newer than its `dist/`
- **THEN** it returns the line with that package root, resolved to an absolute path

#### Scenario: Watcher start
- **WHEN** `startWatcher` starts in `once` mode with that stale package root
- **THEN** stderr holds exactly that line and the watcher exits 1

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` in this checkout, because the globally linked `osq` runs `dist/`.

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Stale build preflight detection".

One task.

## Background

**Measured on 2026-10-03** by applying the change in a scratch worktree and
running the typecheck and the whole `tests/**/*.test.ts` suite. Only these
files change:

- `src/watcher/build.ts`: `STALE_BUILD_MESSAGE` becomes `staleBuildMessage(packageRoot)`, and `StaleBuildError` takes the line it carries.
- `src/watcher/stale-pass.ts`: `assertNotStale` and `startStaleCheck` pass the line they found to `StaleBuildError`.
- `tests/vcs-land-command-error.test.ts`, `tests/vcs-land-stale.test.ts`, and `tests/watcher-stale-every-pass.test.ts` import `STALE_BUILD_MESSAGE`. Each compares against `staleBuildMessage(packageRoot)` for the package root it built.

`tests/watcher-stale-preflight.test.ts` matches `/osq build is stale/`,
`/src\/ is newer than dist\//`, and `/--allow-stale/`. The new wording keeps
all three, so that test stays frozen. `src/cli/land.ts` and
`src/watcher/loop.ts` pass along the line or the error unchanged and need no
edit. The rest of the failures in the scratch run (`bin-execution`,
`package-*`, `command-inputs-doctor-serve`) came from the scratch tree having
no build and are not fallout.

**Why the path is enough.** The package root is resolved from the running
module's URL, which Node gives as the real path even through a `pnpm link`
symlink, so a linked checkout prints the checkout's own folder.
