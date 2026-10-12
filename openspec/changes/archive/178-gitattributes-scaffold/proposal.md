---
title: osq init keeps git storing text files with LF
depends_on: ["174"]
verify: pnpm verify
features:
  reads: [version-control]
---
## Goal

174 added doctor's `git-line-endings` warning, which tells the human to run
`git add --renormalize .` when a tracked file holds CRLF in the index. That
command converts a file only when git treats it as text, and `osq init`
writes no `.gitattributes`, so in most consumer projects the suggested fix
does nothing and new CRLF files keep getting committed.

With this change, `osq init` keeps one managed block at the top of
`.gitattributes`:

```
# OSQ:GITATTRIBUTES:START
* text=auto
# OSQ:GITATTRIBUTES:END
```

Git then stores text files with LF in the index, and `git add --renormalize .`
has the attribute it needs. Later lines in `.gitattributes` win in git, so the
project's own rules below the block still override it. With `vcs.enabled`,
`osq doctor` adds a passing `gitattributes` warning naming `osq init` when the
file or its current block is missing. osq's own `.gitattributes` gets the
block, and README's file list gains the line.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new init and doctor
tests, `tests/function-budget.test.ts`, which caps `scaffoldProject` at 80
lines, and the README tests), and lint, on the final tree.

## Non-goals

- `eol=lf` in the block. It would force LF working trees on every consumer,
  including Windows; that choice stays with the project.
- Running git to renormalize or commit anything.
- Failing doctor over a missing block, or warning without `vcs.enabled`.

## Surface

- Added: `osq init` output line `updated  .gitattributes (line endings)`.
- Added: `.gitattributes` managed block between `# OSQ:GITATTRIBUTES:START` and `# OSQ:GITATTRIBUTES:END`.
- Added: `osq doctor` warning `gitattributes`.

## Decisions

- ADR 001: unchanged; init and doctor read config through the existing loader.
- ADR 004: unchanged; doctor's OpenSpec validator check is not touched.
- ADR 005: unchanged; no validator version check is touched.
- ADR 010: unchanged; the validator doctor check is not touched.
- ADR 012: unchanged; the watch service runs neither init nor doctor.
- ADR 015: unchanged; `osq mcp` exposes no init or doctor tool.

## Assumptions

- `* text=auto` alone keeps a committed CRLF file from showing as modified,
  and `git add --renormalize .` converts it to LF; the brief tested both with
  git on 2026-10-11.
- Putting the block above osq's own `* text=auto eol=lf` line changes nothing
  for this repository, since the later line wins.
- A `.gitattributes` with CRLF line endings never matches the LF block, so
  init rewrites its block once with LF and leaves it alone after that.

## Contract

The cli-foundation delta below is the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Gitattributes line endings block"
  and "Doctor gitattributes warning".

Task 2 imports `GITATTRIBUTES_BLOCK` from task 1's
`src/core/foundation/gitattributes-block.ts` without editing it. No file is
shared between tasks.
