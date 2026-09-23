---
title: Proposal surface section
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

Every proposal declares the user-facing surface it adds, changes, or removes,
so surface growth is something a human sees and approves at the gate. Nothing
records it today, and the roadmap alone would add about a dozen user-facing
names if every item shipped as first written.

The section sits between `## Non-goals` and `## Contract` in both proposal
templates, the osq schema's proposal instruction, and the managed `PLANNER.md`
block, so osq planners and OpenSpec-aware agents both write it. Lint checks
only that the section exists and says something. A proposal with nothing to
declare writes one line: `None`.

The change is designed to add as little friction as possible. It adds one lint
rule, which planners hit before approval, and no new watcher gates, so it can't
cause executor retries. `osq new` seeds the section with a comment naming the
categories and a `None` line, so a fresh proposal passes lint. The planner
replaces `None` with a list when the change adds names, and the human sees
whatever the section says at approval.

## Verify

`pnpm verify`

The suite checks five things. Every proposal entry point names `## Surface` in
order. Both templates and the repository's schema copy stay byte-identical.
The managed `PLANNER.md` block asks for the section. Lint accepts `None` or a
list and rejects a missing or comment-only section. Every existing test that
writes a proposal inline still passes. It needs no network service, TTY, or
real model.

## Non-goals

- Checking that the declared surface matches the code.
- Parsing the section into categories, scoring it, budgeting it, or totalling it
  in `osq report`.
- Linting archived proposals. `osq lint` already skips `archive/`, and only
  `osq lint` and `osq approve` run the linter.
- Changing `osq migrate`'s placeholder proposal, which already fails lint for
  its missing `verify`.

## Surface

- Added: the `## Surface` proposal section (document section), required by
  `osq lint` and `osq approve`.

## Contract

### Requirement: Proposal surface declaration

`osq lint` and `osq approve` SHALL reject a `proposal.md` whose `## Surface`
section is missing or holds nothing but HTML comments and whitespace. Any other
text, including a single `None`, SHALL pass. A legacy `spec.md` SHALL be exempt.

#### Scenario: Declared surface
- **WHEN** a proposal's `## Surface` section says `None` or lists added, changed, or removed names
- **THEN** lint reports no surface error

#### Scenario: Missing surface
- **WHEN** a proposal has no `## Surface` section, or the section holds only comments
- **THEN** lint fails with one error that says to list the change's user-facing names or write `None`

### Requirement: Surface in every proposal entry point

Both proposal templates, the osq schema's proposal instruction, the proposal
rules in `config.yaml`, and the managed `PLANNER.md` block SHALL name
`## Surface` between `## Non-goals` and `## Contract`. They SHALL list seven
categories: commands, flags, config keys, frontmatter fields, document
sections, dead reasons, and event types.

#### Scenario: New proposal
- **WHEN** `osq new` seeds a proposal
- **THEN** it has a `## Surface` section after `## Non-goals` holding a comment that names the categories, followed by `None`

## Human steps

- Review the proposal, both deltas, and the three task bodies, then run
  `pnpm osq approve 053` yourself.
- In each consumer project, run `osq init` to refresh the managed `PLANNER.md`
  block and `osq init --refresh-schema` to pick up the template. Any proposal
  in flight there needs a `## Surface` section before its next lint or approve.

## Delta

- `specs/spec-lint-and-approve/spec.md` adds `Proposal surface declaration`.
- `specs/cli-foundation/spec.md` modifies `One proposal format` to add the
  section, its categories, and the planner rule.

Task 1 owns every template, the managed planner block, the repository's schema
copy, and the golden event fixtures. Task 2 adds `## Surface` to inline test
proposals, which is harmless before the rule exists. Task 3 adds the lint rule
and the remaining inline test proposals, so the suite stays green after every
task. No file belongs to two tasks.
