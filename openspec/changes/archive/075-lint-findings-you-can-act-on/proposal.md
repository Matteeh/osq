---
title: Lint findings you can act on
depends_on:
  - "074"
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
---
## Goal

Every lint finding tells the planner what it is, where it is, whether it
blocks, and what to do. Findings that belong to the rest of the repository stop
being charged to the change being linted. Lint also validates the living spec
each delta will produce, so problems that today only appear after archive
appear before approval. Covers roadmap item 2.7.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests lint temporary
projects with the repository's real OpenSpec binary and prove that an error and
a warning carry distinguishable severity, a file, and a requirement in text and
in `osq lint --json`; that a long requirement in a living spec is a repository
finding that leaves a clean change's exit code at 0 and prints once when two
changes are linted; that a chained task verify is refused with the
package-script advice; that OpenSpec's `skip_specs: true` advice is marked as
unsupported by osq; and that a delta creating a capability with a too-brief
`## Purpose` produces a finding naming the capability and the spec after
archive.

## Non-goals

- New lint rules beyond validating the merged living spec.
- Fixing the repository findings themselves.
- Rewording refusals other than the chained verify and the `skip_specs` advice.
- Changing what `osq approve` prints; it keeps printing the change's own lint
  warnings and still fails on the change's own lint errors.

## Surface

- Changed: `osq lint` prints each finding as `<change>: <severity> <file> (<requirement or section>): <message>` and prints repository findings once, in their own group after every change (lint output)
- Added: `osq lint --json` (flag)
- Changed: the chained task verify refusal names the package-script fix (lint message)
- Changed: OpenSpec messages that suggest `skip_specs: true` are marked unsupported by osq (lint message)
- Added: lint findings about a capability's living spec after archive (lint message)

## Background

`lintCommand` in `src/cli/lint.ts` prints `<name>: <finding>` through
`logger.error` and `logger.warn`. `lintChangeFolder` in
`src/core/spec/linter.ts` collects plain strings in `errors` and `warnings`.
`validateWithOpenSpec` runs `openspec validate --changes --strict` and
`openspec validate --specs --strict` over the whole repository, and
`parseOpenSpecFindings` flattens the JSON to messages, dropping each item's `id`
and `type` and each issue's `path`. So a warning about a living spec lands on
every change. On ts-paas, a warning about 002's two long requirements reached
every lint from 003 on, and four planning sessions reported it. PLANNER.md tells
the planner to fix every finding and to write only inside the change folder, so
a finding about a living spec is an instruction the planner can't follow.

OpenSpec's JSON has `items`, each with `id`, `type` (`change` or `spec`), and
`issues`, each with `level` (`ERROR`, `WARNING`, or `INFO`), `path`, and
`message`. A spec issue's `path` is `requirements[<index>]` or `overview` (the
`## Purpose`). A change issue's `path` is a delta file relative to the change's
`specs/`, such as `cap/spec.md`. A change with no delta gets an error whose text
ends by suggesting `skip_specs: true` in `.openspec.yaml`; osq does not honor
that setting.

`verifyDeltaTargets` calls `mergeDelta` on every delta against its living spec
and keeps only merge errors. Running `openspec validate --specs --strict` with
the working directory set to a temporary folder holding
`openspec/specs/<capability>/spec.md` validates that text alone. A new
capability whose delta has `## Purpose` shorter than 50 characters passes
change validation but gets OpenSpec's warning `Purpose section is too brief`
after the merge. A merged spec also keeps every warning its living spec
already has, such as long requirements, and those must not be charged to the
change.

`linter.ts` is on the line-budget allow list, so the new code goes into new
modules under `src/core/spec/`. Task 1 owns `linter.ts`; task 2 owns
`src/cli/lint.ts` and `src/cli/index.ts`. No file is shared. 074 also edits
`linter.ts`, so this change lands after it.

Measured in a scratch worktree with a rough version of both tasks: the only
test that pins changed behavior is `tests/linter.test.ts`, whose test "retains
the chaining diagnostic without reinterpreting it" asserts that no error
mentions "package script". Tests that read the logger match substrings of
messages at the `warn` and `error` levels, so they keep passing when the
line gains a severity and a file.

## Contract

### Requirement: Lint finding fields
Every lint finding SHALL carry `severity`, `file`, `requirement`, `section`,
and `message`.

#### Scenario: Task finding
- **WHEN** task 1's verify chains commands
- **THEN** the finding has severity `error` and file `openspec/changes/<id>/tasks/1.md`

### Requirement: Repository findings
An OpenSpec finding about another change or a living spec SHALL be a repository
finding that does not affect the change's validity.

#### Scenario: Long living requirement
- **WHEN** a living spec has a requirement longer than 500 characters and a clean change is linted
- **THEN** lint exits 0 and prints the warning once under the repository group

### Requirement: Merged living spec validation
Lint SHALL validate the living spec each delta will produce.

#### Scenario: Brief Purpose
- **WHEN** a delta creates capability `newcap` with a one-word `## Purpose`
- **THEN** lint warns `openspec: newcap after archive: Purpose section is too brief (less than 50 characters)`

## Human steps

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: modifies "OpenSpec strict validation
  integration"; adds "Lint finding fields", "Repository lint findings",
  "Chained verify refusal", "Unsupported OpenSpec advice", "Merged living spec
  validation", and "Lint output".

Two tasks; no file is shared.
