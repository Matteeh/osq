# Spec Delta: rust-manual

## Purpose
The manual feature keeps a human's uncommitted edits on the default branch as one commit with a record the next planner sees, as TypeScript's `osq manual` does. It holds the feature's logic and its command, as ADR 022 says.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: crates/features/manual/** -->
The rust-manual capability SHALL own the `osq-feature-manual` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Manual crate ownership
- **WHEN** file ownership is resolved for the manual feature
- **THEN** system maps `crates/features/manual/**` to rust-manual

### Requirement: Manual command
`ManualFeature` in `osq-feature-manual` SHALL implement core's `Feature`
with the name `manual` and one command, `manual`, whose summary is `keep
uncommitted edits as a manual change with a comment` and whose usage is
`<comment> [paths...]`. `ManualFeature::new()` SHALL read the system clock
at each run, and `ManualFeature::at(now_ms)` SHALL use `now_ms`, epoch
milliseconds, as the keep time. `run` SHALL take the first argument as the
comment and every later one as a named path. With no argument it SHALL fail
with `FeatureError::usage("manual", "expected <comment> [paths...]")`, and
for another command with `FeatureError::unknown_command`. It SHALL read
`osq.toml` through the config kernel's `load_config`, and a config error
SHALL fail with `FeatureError::failed("manual", <the error's text>)`.

#### Scenario: Manual feature commands
- **WHEN** a test reads `ManualFeature::new()`'s name and commands
- **THEN** the name is `manual` and the commands are one `Command` named `manual` with the summary `keep uncommitted edits as a manual change with a comment` and the usage `<comment> [paths...]`

#### Scenario: Manual argument errors
- **WHEN** `ManualFeature::new()` runs the row's command and arguments on a new empty scratch folder
- **THEN** it fails with the row's error and the folder is still empty

| command | arguments | error |
| --- | --- | --- |
| `manual` | none | `usage of manual: expected <comment> [paths...]` |
| `keep` | `x` | `FeatureError::unknown_command("keep")` |

### Requirement: Manual refusals
`manual` SHALL refuse, writing nothing, as TypeScript's `keepManualEdits`
refuses, with the first message that applies, each as
`FeatureError::failed("manual", <message>)`:

1. `vcs.manualEdits` is `block`: `vcs.manualEdits is "block" in osq.toml;
   plan a change for these edits instead`. TypeScript names
   `osq.config.ts`; Rust names the file it reads.
2. rust-vcs `project_git_root` fails: the `NestedRoot` text.
3. `project_git_root` gives none, because `vcs.enabled` is off or the root
   is in no repository: `osq manual needs vcs.enabled and a git checkout`.
4. the trimmed comment is empty: `osq manual needs a comment: osq manual
   "<why>"`.
5. a named path, as written, is `openspec/changes` or under it after its
   `/` runs and trailing `/` are dropped and `.` and `..` segments are
   resolved as `path.posix.normalize` does: `<path> belongs to a change;
   osq manual keeps edits outside openspec/changes`.
6. a named path names no entry of the vcs port's `status()`, where a named
   path names an entry when, normalized as in 5, it equals the entry's path
   or is a folder prefix of it: `<path> has no uncommitted edits`.
7. no entry is left once selection drops every entry under
   `openspec/changes`: `nothing to keep: the checkout has no uncommitted
   edits outside openspec/changes`.

Selection SHALL be every status entry whose code is not `??` when no path
is named, and every entry a named path names, untracked ones included,
when any is.

#### Scenario: Manual refusals equal TypeScript's
- **WHEN** a test runs, as `tests/fixtures/golden/print-goldens.mjs.txt` describes, each of the cases `block`, `vcs-off`, `no-git`, `nested`, `blank-comment`, `change-path`, `no-edits-path`, `nothing-to-keep` and `only-untracked` of `tests/fixtures/golden/cases.json` through `ManualFeature::at(1792094462123)` on a scratch folder under `std::env::temp_dir()`, its error message standing for the thrown message
- **THEN** the dump equals `tests/fixtures/golden/<case>.txt`, which TypeScript's `dist` printed, except that the `block` case's message names `osq.toml` where the golden names `osq.config.ts`

### Requirement: Manual keep
Once nothing refuses, `manual` SHALL keep the selected entries as
TypeScript's `keepManualEdits` does:

- The record paths are each selected entry's path and its rename source
  `from`, distinct and sorted by bytes.
- The keep time is the clock's time written as `YYYY-MM-DDTHH:MM:SS.mmmZ`
  in UTC.
- The record is `openspec/manual/<stamp>.md`, where `<stamp>` is the keep
  time with every `:` and `.` replaced by `-`. Its text is `---\n`, the
  frontmatter that rust-storage `write_frontmatter` writes for `kept_at`,
  the keep time; `paths`, the record paths; and `capabilities`, in that
  order, then `---\n`, the trimmed comment and `\n`. `capabilities` is
  the distinct sorted union of rust-specs `owner_capabilities` of each
  record path over `read_capability_ownership` of `openspec/specs`.
- It commits the record paths and the record's project-relative path
  through the vcs port's `commit`, with the subject `osq: manual <first
  line of the trimmed comment>` and, when the comment has more lines,
  a blank line and those lines joined with `\n`. The author is
  `<user.name> <<user.email>>` when the port's `config_value` gives both,
  and otherwise `vcs.author`, or the empty string when that is unset.
- When the commit fails, it removes the record and fails with
  `FeatureError::failed("manual", <the error's text>)`.
- Its output is `Kept <record paths joined with ", "> as <first 7
  characters of the commit>\n`, then, when any `??` entry outside
  `openspec/changes` was not selected, `Left out untracked: <those paths,
  distinct and sorted, joined with ", ">; name them to keep them\n`, with
  exit code 0.

#### Scenario: Manual keep equals TypeScript's
- **WHEN** a test runs, as `tests/fixtures/golden/print-goldens.mjs.txt` describes, each of the cases `tracked`, `named-untracked`, `folder-prefix`, `rename`, `multiline`, `change-folders-left-out`, `unowned`, `author-fallback` and `commit-fails` of `tests/fixtures/golden/cases.json` through `ManualFeature::at(1792094462123)` on a scratch folder under `std::env::temp_dir()`, its output lines standing for the returned lines and its error message for the thrown message
- **THEN** the dump equals `tests/fixtures/golden/<case>.txt`, which TypeScript's `dist` printed

#### Scenario: The planner reads a kept edit
- **WHEN** the `folder-prefix` case has run
- **THEN** rust-storage `read_manual_edits` of the scratch project gives one record with the file `2026-10-15T20-01-02-123Z.md`, `kept_at` `2026-10-15T20:01:02.123Z`, the paths `src/app.ts` and `src/lib/util.ts`, the capabilities `alpha` and `beta`, and the comment `bump the source`
