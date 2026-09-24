---
title: Fixes from the first outside run
depends_on: ["068"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - spec-lint-and-approve
---
## Goal

Records name osq's own version and commit as osq's and the project's commit as
the project's. The `unknown_capability` approval flag fires on a likely mistake
instead of on every change that deliberately creates a capability. Two runs of
the same failing `node:test` file get the same dead marker fingerprint, so stuck
detection works on the failures it meets most often.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests prove that
`started` events, the idle status line, and done markers carry osq's identity
while the project's HEAD lands in `projectCommit` and `project_commit`; that a
deliberately created capability raises no flag while a delta without
`## Purpose` or with a name resembling a living capability does; and that two
runs of one failing `node:test` file that prints a `mkdtemp` directory produce
the same fingerprint.

## Non-goals

- Rewriting archived events, markers, or recorded flags.
- Fingerprinting by failing test names and assertion messages instead of normalized output.
- Declaring capability creation explicitly in the proposal (roadmap item 4.6).

## Surface

- Added: `projectCommit` on `started` (event field)
- Added: `project_commit` in `.run/done/<n>` (done marker frontmatter field)
- Changed: `version`, `commit`, and `osqVersion` on `started`, and `build_stamp` in done markers, always describe osq's own build (event and marker fields)
- Changed: the `unknown_capability` approval flag fires only for a delta without `## Purpose` or one whose name resembles a living capability, and its label names the condition (approval flag)
- Added: a `(new capability)` marker on a capability heading in the approval digest (digest text)

## Background

The first run on a repository other than osq was ts-paas, which installed osq
0.2.0 from npm. Every `started` event in its change 001 recorded
`osqVersion: "1.0.0"` and `commit: "f82cd94"`, which are ts-paas's own
`package.json` version and HEAD. `resolveBuildInfo` in `src/watcher/build.ts`
reads the project's `package.json` before osq's, runs
`git rev-parse --short HEAD` in the project root, and falls back to hashing the
project's `dist/`. An installed osq package root, `node_modules/@matteeh/osq`,
sits inside the consumer's git work tree, so running git there would also
return the consumer's HEAD. osq's commit therefore comes from git only when
osq's package root is itself the top of a git work tree, which means osq runs
from a checkout.

`resolveBuildInfo` has three callers. `spawn.ts` spreads it into `started`,
`loop.ts` prints it in the idle status line, and `buildDoneMetadata` in
`regression.ts` writes its commit as `build_stamp`. Human recertification in
`retry.ts` merges the existing done frontmatter, so a new key survives it
without code changes.

The approval digest flagged `unknown_capability` on ts-paas change 001, whose
brief creates the `cli` capability, and five of that run's ten changes create
one. A delta for a new capability carries a `## Purpose` section
(`extractPurposeSection` in `src/core/spec/delta.ts`, exposed as `purpose` by
`parseDelta`). Without one, archive creates the capability with a placeholder
Purpose, so a misspelled capability folder still archives silently as a new
capability. That is the mistake the flag exists to catch, and the resemblance
check catches the other form of it.

A name resembles a living capability when any of these hold:

- the two names are equal once hyphens and underscores are removed;
- the words of one name, split on hyphens and underscores, all appear among the
  words of the other, so `watcher-harness` resembles `watcher-and-harness`;
- both names are at least five characters long and their edit distance is at
  most two, so `watcher-and-harnes` resembles `watcher-and-harness` while `cli`
  does not resemble `api`.

`normalizeFailureBody` in `src/watcher/fingerprint.ts` already replaces
durations written as a number followed by a unit. Node's test runner prints
`duration_ms: 3.803686` and `# duration_ms 92.962079`, with the number after the
key, and test output often names `mkdtemp` directories such as
`/tmp/paas-Hfp38F` that differ on every run. A `verify_red` marker holds the
verify command's whole output, so both land in every fingerprint.

File budgets: `build.ts` is 199 lines under the 250-line cap, so the project
commit lives in new `src/watcher/build-project.ts`. `spawn.ts` is 187 lines and
`outcome.ts` 190 under the strict under-200 budget for runner lifecycle modules
in `tests/import-graph.test.ts`. `regression.ts` is 243 lines, `digest.ts` 239,
and `digest-flags.ts` 236, so the resemblance check lives in new
`src/core/spec/digest-capability.ts`.

Measured in a scratch worktree with a rough version of all three parts: the only
failing tests were `tests/golden-events.test.ts` (the two golden streams gain
`"projectCommit":null`), `tests/approval-digest.test.ts` (flag labels and the
capability shape), and one assertion in `tests/dead-fingerprint.test.ts` that
expects `/tmp/proj/src/a.ts` to survive normalization unchanged.

## Contract

### Requirement: Build identity metadata
osq's identity SHALL come from osq's own package: its `package.json` version,
and its short git commit only when osq's package root is the top of a git work
tree, otherwise a hash of osq's `dist/`, otherwise `unknown`. The project's
identity SHALL be the project root's short HEAD commit, or null.

#### Scenario: Installed inside a project
- **WHEN** osq's package root sits below the top of the project's git work tree
- **THEN** osq's commit is its `dist/` hash or `unknown`, never the project's HEAD, and the project's HEAD is recorded as the project commit

### Requirement: Approval flags
`unknown_capability` SHALL fire only for a delta whose capability has no living
spec and that either has no `## Purpose` or has a name resembling a living
capability.

#### Scenario: Deliberate creation
- **WHEN** a delta with `## Purpose` targets a new name that resembles no living capability
- **THEN** no `unknown_capability` flag fires and the digest marks it as a new capability

### Requirement: Dead marker fingerprint
Normalization SHALL also replace numbers after duration keys and paths under
the operating system's temp directory.

#### Scenario: Repeated node:test failure
- **WHEN** the same failing `node:test` file that creates and prints a `mkdtemp` directory runs twice
- **THEN** the two dead markers have the same fingerprint

## Human steps

- Review the proposal, delta specs, and task bodies, then run `osq approve 069`
  yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: modifies "Build identity metadata",
  "Typed event hygiene and single emission path", "Done marker scope hash
  frontmatter", and "Dead marker fingerprint".
- `specs/spec-lint-and-approve/spec.md`: modifies "Approval digest" and
  "Approval flags".

Three tasks; no file is shared.
