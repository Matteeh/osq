---
title: osq doctor and the approve view name the gates that don't cover a project's other languages
depends_on: [185]
verify: pnpm verify
creates:
  - name: languages
    group: kernel
features:
  reads:
    - status-inspection
    - version-control
---
## Goal

Lay the foundation ADR 017 decides, and put it to its first use. A new kernel
slice `src/kernel/languages/` knows four languages as data, finds a path's
language from its nearest manifest, and holds the one list of which gates and
extras cover which language. On a project that is not only TypeScript, osq
then stops pretending its TypeScript-only gates apply: `osq doctor` names the
languages and lists each gate and extra that does not cover them, and the
approve view shows one notice when a change's scope touches files of such a
language. A human never trusts a gate that silently does nothing. This is the
first step toward Rust projects, and so toward the Rust rebuild.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the three new test files and the widened core boundary in
`tests/import-graph.test.ts`.

## Non-goals

- Making any gate or extra cover another language, or moving TypeScript code behind the slice.
- An adapter type. ADR 017 decision 5 adds its methods when the first gate moves.
- A config override for language facts.
- A `languages` line on a pure TypeScript project.

## Surface

- Added: capability `languages`, group `kernel`, in `src/kernel/languages/`.
- Added: `languages` (`osq doctor` check)
- Added: `language_gap` (approval notice)

## Decisions

- ADR 001: config loading is untouched.
- ADR 002: archive replays the deltas as usual; the new capability is an ordinary ADDED spec.
- ADR 004: the OpenSpec validator invocation and its `validator` doctor check are untouched.
- ADR 005: the peer range rule is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` is untouched.
- ADR 016: `languages` is a kernel slice, its own capability with `group: kernel`; `src/core` may import it, so the core boundary in watcher-and-harness widens to `src/kernel`.
- ADR 017: the slice follows decisions 1 to 4 and 6; decisions 5 and 7 are why it has no adapter yet.

## Assumptions

- The `languages` check appears only when a language other than TypeScript/JavaScript is found. A line on every TypeScript project adds noise and would change the check lists that existing doctor tests pin, such as `tests/doctor.test.ts`. A pure TypeScript project sees nothing new.
- Detection reads tracked files through the existing `lineEndings()` read of the `Vcs` port, so no port method is added. Without git it reads the root manifests only. The approve notice adds the task's own resolved paths, so a manifest the change scopes counts before it is committed.
- Until the `git` and `config` kernel slices move, `src/kernel/languages/` imports `selectVcs` and the `OsqConfig` type from `src/core`. ADR 016 forbids a kernel slice importing a feature slice; both are kernel-to-be, so this is the "new code goes where its code is today" rule from the other side.
- `language_gap` is amber, like the other notices that say "look before you trust this plan". It does not block approval; only red notices must be opened.
- Measured on 2026-10-12: a prototype of all three tasks in a scratch tree, stacked on 185, failed only the two `tests/import-graph.test.ts` cases for `src/core` importing `src/kernel` (3896 pass, 2 fail). Task 1 widens that rule; with it, those checks, `tests/capability-slices.test.ts` and both budget tests pass.

## Background

**Replanned 2026-10-12.** The first plan of this change put detection and the
coverage list in `src/core/foundation/languages.ts`. The user then decided the
foundation first: language per path by nearest manifest, a `languages` kernel
slice, ADR 017 as its own change (185), and a tiny start. This change now
builds that slice and puts the doctor check and the notice on top.

**Why nearest manifest per path.** A crate's `README.md` or a `.ts` build
script inside a crate has no language, so it raises no gap. `src/lib.rs` in a
crate whose `Cargo.toml` is tracked is Rust wherever the crate sits.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/languages/spec.md`: new capability `languages`, ADDED "Code ownership", "Language presets and coverage", "Language of a path", "Project language map".
- `specs/cli-foundation/spec.md`: ADDED "Languages doctor check".
- `specs/spec-lint-and-approve/spec.md`: ADDED "Language gap notice".
- `specs/watcher-and-harness/spec.md`: MODIFIED "Architectural import graph boundaries": `src/core` may also import `src/kernel`.

No file is shared between tasks. Tasks 2 and 3 import task 1's slice without changing it.
