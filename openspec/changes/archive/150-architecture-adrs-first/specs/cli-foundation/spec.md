## ADDED Requirements

### Requirement: Decisions scaffold
`osq init` SHALL write `<paths.decisions>/README.md` from
`templates/decisions/README.md` when that file is missing. It SHALL write
`<paths.decisions>/000-how-this-project-is-built.md` from
`templates/decisions/000-how-this-project-is-built.md` only when the decisions
folder is missing or holds no markdown file other than `README.md`. An existing
file SHALL never be overwritten, `--refresh-schema` included, and SHALL be
reported as existing like the other scaffolded files.

The README SHALL describe the ADR frontmatter osq reads: `status`,
`applies_to`, `rule`, `superseded_by`, `checks`, and `denies`, that only
accepted ADRs take effect, and that the number comes from the file name. The
starter SHALL have frontmatter `status: proposed` and `applies_to: all` and
no `rule`, the heading `# 000. How this project is built`, and one `## `
section per question, in this order: `Layering` (which layers exist, what
each may import, and where logic lives), `State` (where state lives and who
writes it), `Errors` (how errors are raised, reported, and recovered), `Tests`
(what a test looks like and what it may touch), and `Naming` (how files,
modules, and functions are named). A closing section SHALL say to turn each
answer that is a rule into an accepted ADR with `applies_to: all`, a
one-sentence `rule`, and `checks` naming a test wherever the rule can be
tested. The starter SHALL prescribe no answer.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory
- **THEN** `decisions/README.md` and `decisions/000-how-this-project-is-built.md` exist, both are in `createdFiles`, and `readDecisions` reads ADR `000` with status `proposed`

#### Scenario: Re-run keeps edits
- **WHEN** the starter has been edited and `osq init --refresh-schema` runs again
- **THEN** the starter keeps its edited bytes and is reported as existing

#### Scenario: Project with ADRs
- **WHEN** `osq init` runs in a project whose decisions folder holds `001-x.md` and no README
- **THEN** it writes `decisions/README.md` and no starter

### Requirement: Planner architecture-first guidance
The managed `PLANNER.md` block SHALL say, under `### Either way`, that a
project with no accepted ADR that applies to all writes its architecture and
style ADRs first, each with a one-sentence rule and a checks test where the
rule can be tested.

#### Scenario: Planner block names the order
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it holds `writes its architecture` and `and style ADRs first`

### Requirement: Architecture-first documentation
README's `## Install` block SHALL show, after `init`, writing the architecture
and style ADRs, starting from `decisions/000-how-this-project-is-built.md`,
before the first feature brief. The `decisions/` line in
`## What it puts in your repo` SHALL be marked as written by `osq init`. The
`### Architecture decisions` section SHALL say that decisions lint applies
once the project has an accepted ADR, and that `osq doctor` warns until an
accepted ADR applies to `all`.

#### Scenario: README order
- **WHEN** README is read
- **THEN** `## Install` names `decisions/000-how-this-project-is-built.md` after `init`, and `### Architecture decisions` says lint applies once an ADR is accepted

## MODIFIED Requirements

### Requirement: Decisions doctor check
`osq doctor` SHALL add a `decisions` check, after `managed-blocks`, when the
decisions folder holds a markdown file other than `README.md` or AGENTS.md
holds a rules marker. The check SHALL fail on any validation error, on a rules
block that doesn't match the accepted ADRs, saying to run `osq init`, and on
more system-wide rules than `limits.maxProjectRules`, naming the limit. With no
failure, it SHALL pass with a warning when at least one validation warning
exists or no accepted ADR applies to `all`. The warning SHALL list each
ignored file and unknown capability, then, when no accepted ADR applies to
`all`, `no accepted ADR applies to all; write the architecture and style ADRs
first`, joined with `; `. Without ADR files or a rules marker, the check list
SHALL be unchanged.

#### Scenario: Stale block
- **WHEN** a new accepted system-wide ADR is added and `osq init` has not run
- **THEN** doctor prints `[fail] decisions:` with a message naming `osq init`, and passes after `osq init`

#### Scenario: Ignored file
- **WHEN** the decisions folder holds one ADR with frontmatter and one without
- **THEN** doctor prints a `[warn] decisions:` line naming the file without frontmatter and exits zero

#### Scenario: No system-wide ADR
- **WHEN** a project's only ADR is the proposed starter from `osq init`
- **THEN** doctor prints `[warn] decisions: no accepted ADR applies to all; write the architecture and style ADRs first` and exits zero

#### Scenario: System-wide ADR accepted
- **WHEN** the starter is accepted with a `rule` and `osq init` has written the rules block
- **THEN** the `decisions` check passes with no warning
