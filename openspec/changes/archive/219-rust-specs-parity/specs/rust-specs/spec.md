# Spec Delta: rust-specs

## ADDED Requirements

### Requirement: OpenSpec validate parity
The specs kernel's validation SHALL give the same pass or fail as
`openspec validate --strict --json --no-interactive` on every item below,
except the fixed differences of "Validate differences". The OpenSpec CLI is
the one `OSQ_OPENSPEC_BIN` names, or `node_modules/.bin/openspec` under the
repository root when that variable is unset or empty, run with
`OPENSPEC_TELEMETRY=0` in a temporary project. An item passes in OpenSpec
when the command exits 0. A missing CLI fails the test, naming the path.

- Each living spec under `openspec/specs/`: OpenSpec validates a copy of
  the folder with `--specs`, one item per capability, and the Rust side
  passes when `validate_living_spec` gives no finding.
- Each archived change under `openspec/changes/archive/`, in the landing
  order of "Archive replay", against the living specs that replaying the
  changes before it gives: OpenSpec validates the change with
  `<name> --type change`, in a project holding that replay as
  `openspec/specs/` and the change's `proposal.md`, `tasks.md` and
  `specs/` under `openspec/changes/<name>/`. The Rust side passes when
  `validate_change` gives no finding and `validate_merged_change` gives no
  finding and no error, against the same replay. The replay then merges
  the change with `merge_change`.
- Each living spec fixture under
  `crates/kernel/specs/tests/fixtures/validate/living/`, as the only spec
  of a project, named after its file stem and validated with
  `<stem> --type spec`. The Rust side runs `validate_living_spec`.
- Each delta spec fixture under
  `crates/kernel/specs/tests/fixtures/validate/delta/`, as
  `specs/alpha/spec.md` of a change `parity` with no living spec. The Rust
  side runs `validate_delta`.
- Each change under
  `crates/kernel/specs/tests/fixtures/validate/targets/changes/`, with
  `targets/specs/` as the living specs. The Rust side runs
  `validate_change` and `validate_merged_change` as for an archived change.

A change written to a temporary project without a `proposal.md` gets one
holding `# Parity fixture\n`, because OpenSpec reads a change only through
its proposal. The test prints every item whose results differ, not only
the first. The validate and merge fixture tests are its fast
counterparts.

#### Scenario: Validate differences
- **WHEN** the items of "OpenSpec validate parity" are validated by both
- **THEN** every item gives the same result in both, except exactly these, each of which differs as given:

| Item | Rust | OpenSpec | Why |
|---|---|---|---|
| `fixtures/validate/living/valid.md` | pass | fail | OpenSpec warns that a Purpose under 50 characters is too brief, which ADR 026 does not port |
| `fixtures/validate/delta/empty-delta-section.md` | fail | pass | ADR 026 makes every delta section well formed |
| `fixtures/validate/delta/invalid-rename.md` | fail | pass | ADR 026 makes every delta section well formed |
| `fixtures/validate/delta/unknown-delta-section.md` | fail | pass | ADR 026 allows only the four delta sections |
| `fixtures/validate/targets/changes/unknown` | fail | pass | OpenSpec checks targets only at archive, and ADR 026 checks them at validate |

### Requirement: OpenSpec archive parity
The specs kernel's merge SHALL give the result `openspec archive` gives on
each case of `tests/fixtures/openspec-diff/`, as
`tests/openspec-differential.test.ts` checks for TypeScript. It uses the
OpenSpec CLI of "OpenSpec validate parity". For each case it builds two
temporary projects from the case: `templates/openspec/config.yaml` and
`templates/openspec/schemas/` under `openspec/`, the case's `specs/` as
`openspec/specs/` when it has one, and its `changes/` as
`openspec/changes/`. In one project OpenSpec runs `archive <change> --yes
--json`. In the other, `merge_change` merges each change in byte order of
names into `openspec/specs/`, writing each text or removing an emptied
capability's folder before the next. The case's `case.json` names what to
expect:

- `identical`: OpenSpec validates each change with `validate <change>
  --type change --strict --json --no-interactive` and archives each, both
  exiting 0, and the two `openspec/specs/` trees are equal, path for path
  and byte for byte.
- `both-refuse`: OpenSpec's archive of the first change exits non-zero
  with a `status` entry whose `code` is `archive_spec_update_failed`, the
  Rust merge gives a `MergeChangeError::Merge`, and both trees still equal
  the case's `specs/`.
- `osq-refuses`: the Rust merge gives a `MergeChangeError::Merge` whose
  `MergeError` message holds `### Requirement:`, OpenSpec's archive exits
  0, and no living spec it leaves holds `### Requirement: <name>` for any
  `TO:` name of the case's delta specs.

The archive parity cases are its fast counterpart.

#### Scenario: Archive cases match OpenSpec
- **WHEN** each case under `tests/fixtures/openspec-diff/` is archived by both
- **THEN** each case gives the result its `case.json` names, and the cases checked are exactly the folders there
