## MODIFIED Requirements

### Requirement: Effective scenario lookup
<!-- source: src/core/trace/scenario-lookup.ts, src/core/trace/lookup-root.ts, tests/trace-scenario-lookup.test.ts, tests/trace-worktree-change.test.ts -->
osq SHALL look up a scenario by capability and exact name and return its
outcomes as parsed by "Scenario outcomes", or fail with one message.

When `OSQ_CHANGE` holds a change folder `<root>/changes/<id>`, the openspec root
SHALL be `<root>`. The effective spec SHALL be the living spec
`<root>/specs/<capability>/spec.md`, merged with `mergeDelta` with the change's
`specs/<capability>/spec.md` when that delta exists. A scenario the change
removes is not found.

Without `OSQ_CHANGE`, the openspec root SHALL be `openspec/` in the nearest
ancestor of the working directory, the working directory included, that holds
`openspec/specs`. When the folder that holds that openspec root is an osq
worktree, the lookup SHALL behave as if `OSQ_CHANGE` held that worktree's
change folder. The folder is an osq worktree when its `.git` is a file whose
`gitdir: <path>` line names a directory, resolved against the folder when it
is relative, whose `HEAD` file reads `ref: refs/heads/osq/<folder>`, and
`<openspec root>/changes/<folder>` is a directory. The lookup SHALL read only
those two files, SHALL NOT spawn a process, and SHALL read them at most once
per process for each openspec root. A `.git` directory, a missing or
unreadable file, a detached `HEAD`, a branch not starting with `osq/`, or a
change folder that is not under `changes/`, such as one already archived,
SHALL leave the lookup as it is without `OSQ_CHANGE`.

Otherwise, the places that define a scenario SHALL be the living spec
and each ADDED or MODIFIED requirement of each active change's delta for that
capability, in change folder order. When two places define it with different
outcomes, the lookup SHALL fail with
`The <capability> scenario "<name>" differs between <place> and <place>; set OSQ_CHANGE to the change folder the test should prove`,
where each place is a spec path relative to the folder that holds the openspec
root.

When the effective spec, or without `OSQ_CHANGE` any one place, holds two
scenarios with the same name, every lookup in that capability SHALL fail with
`The <capability> spec has two scenarios named "<name>"`, naming the first
duplicate in document order. A scenario found nowhere SHALL fail with
`The <capability> spec has no scenario "<name>"`. That includes a capability
with no spec. A delta that `mergeDelta` refuses SHALL fail with the refusal's
message.

Each capability's spec SHALL be read and parsed once per process for each
openspec root and `OSQ_CHANGE` value. Every lookup SHALL take the working
directory and environment as arguments, so a caller never reads
`process.env` through it by accident.

#### Scenario: Scenario only in the change
- **WHEN** `OSQ_CHANGE` names a change whose delta adds the scenario "Bulk tier" to pricing
- **THEN** the lookup returns the delta's outcomes for "Bulk tier"

#### Scenario: Modified scenario uses the delta
- **WHEN** `OSQ_CHANGE` names a change whose MODIFIED requirement changes "the total is 1620.00" to "the total is 1600.00"
- **THEN** the lookup returns "the total is 1600.00"

#### Scenario: Removed scenario
- **WHEN** `OSQ_CHANGE` names a change whose delta removes the requirement holding the scenario
- **THEN** the lookup fails with `The pricing spec has no scenario "<name>"`

#### Scenario: Places disagree
- **WHEN** `OSQ_CHANGE` is unset and an active change modifies a scenario's outcomes
- **THEN** the lookup fails naming the living spec path, the change's delta path, and `OSQ_CHANGE`

#### Scenario: Active change adds a scenario
- **WHEN** `OSQ_CHANGE` is unset and only an active change's delta defines the scenario
- **THEN** the lookup returns that delta's outcomes

#### Scenario: Change from the worktree branch
- **WHEN** `OSQ_CHANGE` is unset, the tree's `.git` file points to a directory whose `HEAD` reads `ref: refs/heads/osq/002-b`, and active `001-a` and `002-b` modify the same scenario differently
- **THEN** the lookup returns `002-b`'s outcomes without failing

#### Scenario: Worktree change already archived
- **WHEN** `OSQ_CHANGE` is unset and the `HEAD` names `osq/002-b`, but `changes/002-b` does not exist
- **THEN** the lookup reads the living spec and every active change's delta, as without a worktree

#### Scenario: Checkout or other branch
- **WHEN** `OSQ_CHANGE` is unset and `.git` is a directory, or the `HEAD` names a branch not starting with `osq/`
- **THEN** the lookup resolves as without a worktree

#### Scenario: Branch read once
- **WHEN** a process makes two lookups in the same worktree and the `HEAD` file is rewritten between them to name another branch
- **THEN** both lookups use the change the first read named
