---
title: osq doctor warns about files with CRLF or mixed line endings
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

On 2026-09-28, 108 halted with `worktree_dirty` before any task ran.
`biome.json` and `fixture/AGENTS.md` had held one CRLF line each since the
first commit while `.gitattributes` said `eol=lf`, so a fresh worktree checked
them out with LF and git reported them modified. The fix on main was
`git add --renormalize .`, but nothing warned beforehand.

With this change, `osq doctor` with `vcs.enabled` adds a `git-line-endings`
warning when any tracked file's index line ending is CRLF or mixed. The
warning names up to `limits.maxListedLineEndings` files and the total count,
and tells the human to run `git add --renormalize .` and commit. The read goes
through a new `Vcs` port read, `lineEndings()`, which runs
`git ls-files --eol -z` bounded by `timeouts.gitSeconds` like every git read.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new port and doctor
tests, plus `tests/vcs-write.test.ts`, which pins the port's member list),
and lint, on the final tree.

## Non-goals

- Fixing the files. osq never rewrites them or runs `git add --renormalize`.
- Checking `.gitattributes` or the working tree's line endings; only the
  index matters, because that is what a fresh worktree checks out.
- Warning without `vcs.enabled`, or failing doctor over line endings.

## Surface

- Added: `osq doctor` warning `git-line-endings`.
- Added: config key `limits.maxListedLineEndings`, default 5.

## Decisions

- ADR 001: unchanged; the new limit loads through the existing config path.
- ADR 004: unchanged; doctor's OpenSpec validator check is not touched.
- ADR 005: unchanged; no validator version check is touched.
- ADR 010: unchanged; the validator doctor check is not touched.
- ADR 012: unchanged; the watch service does not run doctor.
- ADR 015: unchanged; `osq mcp` exposes no doctor tool.

## Assumptions

- `git add --renormalize .` converts a file only when git treats it as text,
  through `.gitattributes` (`text`, `text=auto`, `eol=lf`) or `core.autocrlf`.
  A repository with neither keeps its CRLF files after the suggested command;
  the warning still names them, which is the brief's wording.
- `i/none` (an empty file or one without a line break) and `i/-text` (binary)
  never count, and neither does an empty `i/` value, which git prints for a
  symlink such as this repository's `CLAUDE.md`.
- `src/core/foundation/config.ts` has 248 lines against the 250-line budget;
  the new default adds one.

## Contract

The version-control and cli-foundation deltas below are the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: ADDED "Vcs line endings read".
- `specs/cli-foundation/spec.md`: ADDED "Doctor line endings warning".

Task 2 calls `vcs.lineEndings()`, which task 1 adds, without editing task 1's
files. No file is shared between tasks.
