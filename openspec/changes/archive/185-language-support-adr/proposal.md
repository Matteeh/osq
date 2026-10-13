---
title: ADR 017 records how osq supports a project's languages
depends_on: []
verify: pnpm verify
features:
  reads: []
---
## Goal

Before osq learns a second language, one rule decides how languages fit in.
ADR 017, accepted and system-wide, says a path's language comes from its
nearest manifest, that what a language is made of is data while reading its
code is a per-language adapter, that the code lives in a new kernel slice
`src/kernel/languages/`, and that a gate either covers a language or says it
does not. The adapter grows only where languages really differ, and
TypeScript moves behind it one gate per change. Every later language change,
starting with `language-gaps-reported` (184), follows it instead of inventing
its own seam.

## Verify

`pnpm verify`

The typechecks, build, full suite and lint pass. The new
`tests/language-support-adr.test.ts` checks that ADR 017 is accepted and
system-wide, that its rule is in AGENTS.md, that it is indexed once, and that
its sections name the seam's parts. `tests/decisions-own.test.ts` and
`tests/doctor.test.ts` validate the decisions folder and AGENTS.md's rules
block.

## Non-goals

- Any code under `src/kernel/languages/` or a `languages` capability; 184
  starts both.
- Supporting a language other than TypeScript/JavaScript.
- A config override for language facts. The ADR leaves room for it.

## Surface

- Added: ADR 017, `decisions/017-language-support.md` (document)
- Changed: AGENTS.md's `## Project rules` block gains ADR 017's rule
- Changed: the index in `decisions/README.md` lists ADR 017

## Decisions

- ADR 001: unchanged; nothing here loads config.
- ADR 004: unchanged; the OpenSpec validator is not a language gate.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the validator role is not a language gate.
- ADR 012: unchanged; the watch service is untouched.
- ADR 015: unchanged; `osq mcp` is untouched.

## Assumptions

- Language per path by nearest manifest, a kernel slice, the ADR as its own change and a tiny adapter were decided with the user on 2026-10-12.
- The four manifests the ADR names (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`) are the ones `src/core/spec/digest-flags.ts` already knows. More languages add a preset, not a decision.
- A path whose extension is not its nearest manifest's language has no language, so a crate's `README.md` reports no gap. A `.ts` file with no `package.json` above it has no language either; on a real TypeScript project that is rare.
- The ADR has no `checks`, as ADR 006 has none: no code follows it yet, and `osq doctor` fails on an accepted ADR whose check file is missing. 184's tests are its first checks in practice.
- Measured on 2026-10-12: in a scratch tree with the ADR, the index line and the rules line applied, the full suite passed (3898 pass, 0 fail).

## Background

**Why per path.** A Rust crate with a TypeScript dashboard, or a Python tool
beside a Node service, is common. A per-project language would apply
TypeScript gates to the Rust part or the reverse. Nearest manifest rather than
extension alone keeps a stray script or a crate's README out of a package it
does not belong to.

**Why kernel.** The test-modification gate, the denied-dependency gate,
failing-test reading, the import graph, traceability and doctor live in
different slices under ADR 016, and all of them need a path's language. Shared
code is kernel, and its own capability keeps it from becoming the next
cli-foundation.

**Why tiny.** An adapter interface guessed before Rust exists would be shaped
by TypeScript. The ADR names the seam and the order; each gate's move adds the
methods it needs, and JUnit XML spares one test-output reader per language.

## Human steps

### Before approval

None

### After landing

- Update the Notion page "Language support: osq on a project in any language" and the roadmap with ADR 017.

## Delta

- cli-foundation: ADDED "Language support has one seam", proven by task 1's
  `tests/language-support-adr.test.ts`.
