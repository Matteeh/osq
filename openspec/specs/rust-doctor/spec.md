# rust-doctor Specification

## Purpose
The doctor feature checks the tools osq runs, such as the pi harness, and prints what is wrong, as TypeScript's `osq doctor` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/doctor/** -->
The rust-doctor capability SHALL own the `osq-feature-doctor` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Doctor crate ownership
- **WHEN** file ownership is resolved for the doctor feature
- **THEN** system maps `crates/features/doctor/**` to rust-doctor

### Requirement: Doctor command
`osq-feature-doctor` SHALL expose one public item, `DoctorFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `doctor`, and its `commands()` is
one command with the name `doctor`, the summary `check the configuration
and the pi harness` and the usage `` (empty). The crate depends on
`osq-core`, `osq-kernel-config`, `osq-kernel-harnesses`,
`osq-kernel-specs`, `osq-kernel-storage` and `osq-kernel-vcs`, and on no
feature crate.

#### Scenario: Doctor feature commands
- **WHEN** a test reads `DoctorFeature`'s name and commands
- **THEN** the name is `doctor`, and the commands are exactly one, with the name `doctor`, the summary `check the configuration and the pi harness` and an empty usage

### Requirement: Doctor arguments
`DoctorFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `doctor`, and
`FeatureError::usage("doctor", "expected no arguments, got <n>")` for a
`doctor` invocation with `n` arguments when `n` is not 0, before it reads
any file or starts any program.

#### Scenario: Doctor argument errors
- **WHEN** a test runs the invocation in the row with a scratch root that holds no `osq.toml`
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `doctor` with args `x` | `Usage` error displayed `usage of doctor: expected no arguments, got 1` |
| `doctor` with args `x`, `y` | `Usage` error displayed `usage of doctor: expected no arguments, got 2` |
| `inbox` with no args | `UnknownCommand` error displayed `unknown command: inbox` |

### Requirement: Doctor pi checks
`doctor` SHALL print, in this order, the check lines TypeScript's
`osq doctor` prints for the configuration and the pi harness, each as
`[ok] <name>: <message>`, `[warn] <name>: <message>` or
`[fail] <name>: <message>`. After them it SHALL print, in this order, the
`managed-blocks` line from rust-doctor "Doctor managed blocks", the
`decisions` line from "Doctor decisions" when that requirement gives one,
the change lines from "Doctor change checks", and the git lines from
"Doctor git checks":

1. `config`: rust-config `load_config` on the root. On an error it is
   `[fail] config: failed to load: <the ConfigError's display>`, no other
   pi line follows, and every later check uses `Config::default()`, as
   TypeScript falls back to its default config. Otherwise it is
   `[ok] config: loaded (harness: <the executor harness's name>)`, and no
   other pi line follows unless that harness is `pi`.
2. `harness`: the program is rust-harnesses `resolve_pi_binary` with
   `pi.bin` and the process environment. `doctor` runs `<bin> --version`
   through `run_process` in the root, with the process environment,
   `timeouts.harnessPreflightSeconds` as its timeout and
   `timeouts.harnessKillGracePeriodMs` as its kill grace. The version text
   is, as TypeScript's `probeVersion` reads it, the stdout lines joined by
   `\n` when there is any, else the stderr text, trimmed, then its first
   line trimmed. When the run cannot start, times out or exits other than
   0 the line is `[fail] harness: binary unavailable: <bin> (<reason>)`,
   the reason being the start error's display, `timed out`, or
   `exited with code <code>`, and no other pi line follows. Otherwise it is
   `[ok] harness: <bin> <version text>`, trimmed at the end.
3. `harness-version`: `assess_pi_version` on the version text and the
   tested range `>=0.87.0 <0.88.0`, TypeScript's `PI_TESTED_RANGE`.
   Inside the range it is
   `[ok] harness-version: Pi <version> (tested >=0.87.0 <0.88.0)`;
   outside it is `[warn] harness-version: <the assessment's warning>`.
4. `harness-auth`, only when `pi.provider` is set: `preflight_pi` with the
   program, the provider, the root, the process environment, both
   timeouts above and the tested range. On success it is
   `[ok] harness-auth: <provider> credentials ready`. On
   `PiPreflightError::Credentials` it is
   `[fail] harness-auth: <provider> credentials not ready: <detail>`, and
   on any other error
   `[fail] harness-auth: <provider> credentials not ready: <the error's display>`.

When no line starts `[fail]`, `doctor` SHALL return the lines, each
followed by a newline, as its output. Otherwise it SHALL fail with
`FeatureError::failed` with the command `doctor` and the lines joined by
newlines as the message, so the CLI prints them after `doctor failed: `
on stderr and exits 1. `doctor` writes no file.

The fake pi the doctor tests run,
`crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`, SHALL be
committed executable and run in place by its absolute path, never copied
or written by a test. It reads its behaviour from files in its working
directory, since a test cannot set the process environment.

#### Scenario: Doctor checks with a fake pi
- **WHEN** `doctor` runs with no arguments on a new scratch root that `git init` made a repository. The root holds the managed files that "Doctor managed blocks" names, the row's `osq.toml`, and the row's files, each written with a trailing newline. `<fake>` stands for the absolute path of `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`. `<healthy>` stands for `[ok] managed-blocks: managed blocks valid\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n<git>`, where `<git>` is `[ok] git: ` followed by the first line of what `git --version` prints, trimmed. For `--version` the fake exits 1 when `fake-pi-version-once` and `fake-pi-version-ran` both exist. Otherwise it creates `fake-pi-version-ran` when `fake-pi-version-once` exists, sleeps 10 seconds when `fake-pi-version-wait` exists, prints `fake-pi-version` to stdout and `fake-pi-version-stderr` to stderr when each exists, and exits with the code in `fake-pi-version-exit`, else 0. For `auth` it prints `fake-pi-auth` when it exists and exits with the code in `fake-pi-auth-exit`, else 0
- **THEN** each run returns the row's result, written with `\n` escapes, in under 5 seconds, where an output is `Ok` and a message is a `Failed` error for the command `doctor`:

| osq.toml | Files | Result |
|---|---|---|
| none | none | output `[ok] config: loaded (harness: agy)\n<healthy>\n` |
| `[pi]\nbin = "  "` | none | message `[fail] config: failed to load: pi.bin must be a non-empty string\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.87.1` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n<healthy>\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.90.0` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.90.0\n[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n<healthy>\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version-stderr` `0.87.2` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.2\n[ok] harness-version: Pi 0.87.2 (tested >=0.87.0 <0.88.0)\n<healthy>\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | none | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake>\n[warn] harness-version: Pi version "" is outside the tested range >=0.87.0 <0.88.0\n<healthy>\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.87.1`, `fake-pi-version-exit` `2` | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: <fake> (exited with code 2)\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "/nonexistent/pi"` | none | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: /nonexistent/pi (cannot start /nonexistent/pi: No such file or directory (os error 2))\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\n\n[timeouts]\nharnessPreflightSeconds = 1` | `fake-pi-version-wait` empty | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: <fake> (timed out)\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-auth` `{"status":"ready","provider":"deepseek"}` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[ok] harness-auth: deepseek credentials ready\n<healthy>\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-auth` `{"status":"missing","reason":"No API key found for deepseek"}`, `fake-pi-auth-exit` `1` | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[fail] harness-auth: deepseek credentials not ready: No API key found for deepseek\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.90.0`, `fake-pi-auth-exit` `3` | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.90.0\n[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n[fail] harness-auth: deepseek credentials not ready: pi auth check exited with code 3\n<healthy>` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-version-once` empty | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[fail] harness-auth: deepseek credentials not ready: Pi binary not found or failed: <fake>\n<healthy>` |

#### Scenario: Doctor fake pi runs in place
- **WHEN** a test reads the mode of `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`
- **THEN** the mode has the owner, group and other execute bits set

### Requirement: Doctor change checks
After its `decisions` line, or its `managed-blocks` line when there is no
`decisions` line, `doctor` SHALL print three lines, as TypeScript's
`checkLocks`, `checkArchives` and `checkDoneMarkers` print them, whatever
the lines before them hold. The checks read the project's change folders
through the storage read model only (ADR 022), with the config `doctor`
loaded, or `Config::default()` when it failed to load.

The checks first take the root's real path, from `std::fs::canonicalize`,
or the root as given when that fails, and list its change folders:

- With `vcs.enabled`, a `GitVcs` on that path with the config's timeouts
  whose `root()` is a repository: rust-storage `list_tree_changes` over
  `change_trees(<path>, <the worktrees of worktree_list as candidates>,
  <the folders directly under rust-vcs stacked_root(vcs config, repo root,
  $HOME)>)`, as the inbox reads them, with no stacked folders when `HOME`
  is unset or that folder cannot be read.
- Otherwise, or when any git call fails: rust-storage `list_changes` on
  that path.

Each listed folder's files come from rust-storage `read_change_files`, and
every path printed is relative to that real path as Node's
`path.relative` writes it: the shared leading components dropped, one `..`
for each component of the root left, then the rest of the file's path,
joined by `/`.

1. `locks`: every lock of every active folder, in listing order, whose
   pid is `None`, below 1, or names no `/proc/<pid>` entry is orphaned.
   With none it is `[ok] locks: no orphaned locks`, otherwise
   `[fail] locks: orphaned lock(s): <paths joined by ", ">`.
2. `archives`: every archived folder whose files lack a proposal or lack
   tasks is invalid. With none it is `[ok] archives: all archives valid`,
   otherwise `[fail] archives: invalid archive(s): <folder paths joined by ", ">`.
3. `done-markers`: every done marker of every active folder that is not
   verified. With none it is
   `[ok] done-markers: all done markers verified`, otherwise
   `[fail] done-markers: unverified done marker placed by hand: <paths joined by ", ">`.

Rejected folders are never checked.

#### Scenario: Doctor change lines
- **WHEN** `doctor` runs with no arguments on a new scratch root that `git init` made a repository, holding the managed files that "Doctor managed blocks" names, no `osq.toml`, and the row's files under `openspec/changes/`. `<dead>` stands for the lock text `{"pid":2147483647,"startedAt":1}` and `<live>` for `{"pid":<the test process's pid>,"startedAt":1}`. `<config>` stands for `[ok] config: loaded (harness: agy)\n[ok] managed-blocks: managed blocks valid`, and `<git>` for `[ok] git: ` followed by the first line of what `git --version` prints, trimmed. Each `.md` file of an archived or rejected folder is written as `x`
- **THEN** it returns the row's result, written with `\n` escapes, where an output is `Ok` and a message is a `Failed` error for the command `doctor`:

| Files | Result |
|---|---|
| none | output `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n<git>\n` |
| `001-a/.run/running/1.pid` `<live>` | output `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n<git>\n` |
| `001-a/.run/running/1.pid` `<dead>`, `001-a/.run/locks/2.pid` `not json`, `001-a/.run/running/notes.txt` `<dead>`, `002-b/.run/running/1.pid` `{"pid":0}`, `archive/003-c/proposal.md`, `archive/003-c/tasks.md`, `archive/003-c/.run/running/1.pid` `<dead>`, `rejected/004-d/.run/running/1.pid` `<dead>` | message `<config>\n[fail] locks: orphaned lock(s): openspec/changes/001-a/.run/running/1.pid, openspec/changes/001-a/.run/locks/2.pid, openspec/changes/002-b/.run/running/1.pid\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n<git>` |
| `archive/002-b/proposal.md`, `archive/003-c/spec.md`, `archive/003-c/tasks/1.md`, `archive/004-d/tasks.md`, `rejected/005-e/x.md` | message `<config>\n[ok] locks: no orphaned locks\n[fail] archives: invalid archive(s): openspec/changes/archive/002-b, openspec/changes/archive/004-d\n[ok] done-markers: all done markers verified\n<git>` |
| `001-a/.run/done/1.md` `---\nscope_hash: abc\n---\n`, `001-a/.run/done/2.md` `done\n`, `001-a/.run/done/3.md` `---\nmanual: true\nreason: checked by hand\n---\n`, `archive/002-b/proposal.md`, `archive/002-b/tasks.md`, `archive/002-b/.run/done/1.md` `done\n` | message `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[fail] done-markers: unverified done marker placed by hand: openspec/changes/001-a/.run/done/2.md\n<git>` |

#### Scenario: Doctor reads every worktree
- **WHEN** `doctor` runs on a scratch git repository `<scratch>/repo` with one commit on `main`, the managed files that "Doctor managed blocks" names, and an `osq.toml` of `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"\nworktreeRoot = "<scratch>/worktrees"\n`. A worktree `<scratch>/worktrees/002-run`, added on the new branch `osq/002-run`, holds `openspec/changes/002-run/.run/approved` and `openspec/changes/002-run/.run/running/1.pid` as `{"pid":2147483647,"startedAt":1}`, and the checkout holds `openspec/changes/002-run/.run/running/1.pid` with the same text
- **THEN** it fails for the command `doctor` with the message `[ok] config: loaded (harness: agy)\n[ok] managed-blocks: managed blocks valid\n[fail] locks: orphaned lock(s): ../worktrees/002-run/openspec/changes/002-run/.run/running/1.pid\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n<git>\n[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init`, with `<git>` as in "Doctor change lines"

### Requirement: Doctor managed blocks
`doctor` SHALL print one `managed-blocks` line, as TypeScript's
`checkManagedBlocks` builds it. It compares bytes, not just whether the
markers are present. The canonical blocks are TypeScript's
`MANAGED_AGENTS_MD_BODY`, `MANAGED_PLANNER_BLOCK` and
`MANAGED_CLAUDE_PLAN_COMMAND`. The crate's source holds them as committed
text files copied byte for byte. The doctor tests hold their own committed
copies, `agents-block.txt`, `planner-block.txt` and
`claude-plan-command.txt`, in `crates/features/doctor/tests/fixtures/managed/`.
In the scenarios, "the managed files" means a root holding `AGENTS.md`,
`PLANNER.md` and `.claude/commands/osq-plan.md`, each written as the
matching test copy followed by `\n`.

The checked files, in this order, are `AGENTS.md` against the agents
block, `PLANNER.md` against the planner block and
`.claude/commands/osq-plan.md` against the command block. When the
executor's or the planner's harness is `opencode`, `doctor` also checks
`.opencode/agent/osq-coder.md` against the agents block. `osq-coder` is
TypeScript's default opencode agent.

Each file is read under the root as text, with invalid UTF-8 replaced. A
file that cannot be read fails as `<path> is missing`. Otherwise `doctor`
counts the occurrences of `<!-- OSQ:START -->` and of `<!-- OSQ:END -->`,
and the first matching case gives the file's problem:

1. Neither marker occurs: `is missing its managed block`.
2. Either marker occurs more than once: `has duplicate managed blocks`.
3. One marker does not occur: `has a partial managed block`.
4. The end marker comes before the start marker: `has a reversed managed block`.
5. The text from the start marker through the end marker differs from the canonical block: `has a stale managed block`.

A file with a problem fails as `<path> <problem>`, the path written with
`/`.

With no failure the line is `[ok] managed-blocks: managed blocks valid`.
Otherwise it is `[fail] managed-blocks: <groups joined by "; ">`. The first
group is the failures of the first three files, joined by `; `, followed by
` (run osq init)`. The second group is the opencode agent file's failure
followed by ` (run osq setup)`. A group with no failure is left out.

#### Scenario: Doctor managed block lines
- **WHEN** `doctor` runs with no arguments on a new scratch root holding the row's `osq.toml` and the row's files. `<agents>`, `<planner>` and `<command>` stand for the texts of the three test copies, `<start>` for `<!-- OSQ:START -->` and `<end>` for `<!-- OSQ:END -->`
- **THEN** among the lines `doctor` returns, as its output or its failure message, the one that starts with a status and `managed-blocks:` is the row's line:

| osq.toml | Files | Line |
|---|---|---|
| none | `AGENTS.md` `# Agents\n\n<agents>\n`, `PLANNER.md` `<planner>\n`, `.claude/commands/osq-plan.md` `<command>` | `[ok] managed-blocks: managed blocks valid` |
| none | none | `[fail] managed-blocks: AGENTS.md is missing; PLANNER.md is missing; .claude/commands/osq-plan.md is missing (run osq init)` |
| none | `AGENTS.md` `# Agents\n`, `PLANNER.md` `<start>\n<start>\n<end>\n`, `.claude/commands/osq-plan.md` `<start>\n` | `[fail] managed-blocks: AGENTS.md is missing its managed block; PLANNER.md has duplicate managed blocks; .claude/commands/osq-plan.md has a partial managed block (run osq init)` |
| none | `AGENTS.md` `<end>\n<start>\n`, `PLANNER.md` `<start>\nold\n<end>\n`, `.claude/commands/osq-plan.md` `<start>\n<end>\n<end>\n` | `[fail] managed-blocks: AGENTS.md has a reversed managed block; PLANNER.md has a stale managed block; .claude/commands/osq-plan.md has duplicate managed blocks (run osq init)` |
| `[executor]\nharness = "opencode"` | `AGENTS.md` `<agents>\n`, `PLANNER.md` `<planner>\n`, `.claude/commands/osq-plan.md` `<command>\n` | `[fail] managed-blocks: .opencode/agent/osq-coder.md is missing (run osq setup)` |
| `[planner]\nharness = "opencode"\nmodel = "m"` | `AGENTS.md` `<agents>\n`, `PLANNER.md` `<planner>\n`, `.claude/commands/osq-plan.md` `<command>\n`, `.opencode/agent/osq-coder.md` `<agents>\n` | `[ok] managed-blocks: managed blocks valid` |
| `[executor]\nharness = "opencode"` | `.opencode/agent/osq-coder.md` `<end>\n` | `[fail] managed-blocks: AGENTS.md is missing; PLANNER.md is missing; .claude/commands/osq-plan.md is missing (run osq init); .opencode/agent/osq-coder.md has a partial managed block (run osq setup)` |
| `[executor]\nharness = "opencode"` | `AGENTS.md` `<agents>\n`, `PLANNER.md` `<planner>\n`, `.claude/commands/osq-plan.md` `<command>\n`, `.opencode/agent/osq-coder.md` `<start>\nold\n<end>\n` | `[fail] managed-blocks: .opencode/agent/osq-coder.md has a stale managed block (run osq setup)` |

### Requirement: Doctor decisions
`doctor` SHALL print a `decisions` line, as TypeScript's `checkDecisions`
builds it, when the project has decisions. It reads the ADRs with
rust-specs `read_decisions(root, "decisions", "openspec")`. The project
has decisions when that read finds an ADR or an ignored file, or when
`AGENTS.md` holds `<!-- OSQ:RULES:START -->`. Otherwise `doctor` prints no
`decisions` line. A missing `AGENTS.md` reads as the empty text.

The errors, in this order, are:

1. The errors of rust-specs `validate_decisions`, each displayed as `<file>: <message>`. Its living capabilities are the names of the folders directly under `openspec/specs` that hold a `spec.md`, in byte order. Its maximum rule length is `limits.maxRuleLength`.
2. `<adr path>: check file <file> does not exist` for each `checks` entry of each accepted ADR, in ADR order, when nothing exists at that path under the root.
3. The project rules errors: those of rust-specs `project_rules_errors` with
   the ADRs read, the text of `AGENTS.md` and `limits.maxProjectRules`.

The system-wide ADRs are the accepted ADRs whose `governs` is `all`, in
ADR order.

With any error the line is `[fail] decisions: <errors joined by "; ">`.
Otherwise the warnings are those of `validate_decisions`, displayed the
same way. When there is no system-wide ADR, they end with
`no accepted ADR applies to all; write the architecture and style ADRs first`.
With any warning the line is `[warn] decisions: <warnings joined by "; ">`.
Otherwise it is `[ok] decisions: <the number of ADRs> ADRs valid`.

#### Scenario: Doctor decisions lines
- **WHEN** `doctor` runs with no arguments on a new scratch root holding the row's `osq.toml` and the row's files. `<keep>` stands for `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n`. `<rules>` stands for `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->`. `<all>` stands for `no accepted ADR applies to all; write the architecture and style ADRs first`
- **THEN** among the lines `doctor` returns, as its output or its failure message, the one that starts with a status and `decisions:` is the row's line, or no line is when the row says none:

| osq.toml | Files | Line |
|---|---|---|
| none | `AGENTS.md` `# Agents\n` | none |
| none | `decisions/001-keep.md` `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/keep.rs]\n---\n# 001. Keep\n`, `checks/keep.rs` `x`, `AGENTS.md` `<rules>\n` | `[ok] decisions: 1 ADRs valid` |
| none | `openspec/specs/alpha/spec.md` `x`, `decisions/001-alpha.md` `---\nstatus: accepted\napplies_to: [alpha]\nrule: Alpha only.\n---\n# 001. Alpha\n` | `[warn] decisions: <all>` |
| none | `decisions/001-ghost.md` `---\nstatus: proposed\napplies_to: [ghost]\n---\n# 001. Ghost\n`, `decisions/draft.md` `# Draft\n` | `[warn] decisions: decisions/001-ghost.md: applies_to capability "ghost" has no living spec; decisions/draft.md: no osq frontmatter, ignored; <all>` |
| none | `decisions/notes.md` `# Notes\n` | `[warn] decisions: decisions/notes.md: no osq frontmatter, ignored; <all>` |
| none | `AGENTS.md` `<!-- OSQ:RULES:START -->\n` | `[warn] decisions: <all>` |
| none | `decisions/001-keep.md` `---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/missing.rs]\n---\n# 001. Keep\n`, `decisions/002-later.md` `---\nstatus: proposed\napplies_to: all\nchecks: [checks/gone.rs]\n---\n# 002. Later\n`, `AGENTS.md` `# Agents\n` | `` [fail] decisions: decisions/001-keep.md: check file checks/missing.rs does not exist; AGENTS.md is missing its project rules block; run `osq init` `` |
| none | `decisions/001-odd.md` `---\nstatus: done\n---\n# 001. Odd\n`, `AGENTS.md` `<rules>\n` | `` [fail] decisions: decisions/001-odd.md: status must be proposed, accepted, or superseded; AGENTS.md has an unexpected project rules block; run `osq init` `` |
| none | `decisions/001-keep.md` `<keep>`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n` | `` [fail] decisions: AGENTS.md project rules block is out of date; run `osq init` `` |
| none | `decisions/001-keep.md` `<keep>`, `AGENTS.md` `<!-- OSQ:RULES:END -->\n<!-- OSQ:RULES:START -->\n` | `` [fail] decisions: AGENTS.md is missing its project rules block; run `osq init` `` |
| `[limits]\nmaxRuleLength = 5\nmaxProjectRules = 1` | `decisions/001-keep.md` `<keep>`, `decisions/002-also.md` `---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n`, `AGENTS.md` `<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n` | `[fail] decisions: decisions/001-keep.md: rule is longer than limits.maxRuleLength (5); AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)` |

### Requirement: Doctor git checks
After its change lines, `doctor` SHALL print the git lines TypeScript's
`checkGit` prints. None of them fails. Each is `[ok]` or `[warn]`, so
none changes whether `doctor` fails.

`doctor` asks a `GitVcs` on the root, with the config's timeouts, through
rust-vcs's reads. The first matching case gives the `git` line:

1. `version()` gives an error or `None`: `[warn] git: git not found; git checks off`.
2. `root()` gives an error or `None`: `[warn] git: not a git repository; git checks off`.
3. `root()` differs from the root's real path, from `std::fs::canonicalize` or the root as given when that fails: `[warn] git: not the repository root; git checks off`.
4. Otherwise: `[ok] git: <the version>`.

Only in case 4 and with `vcs.enabled`, these warnings follow, each only
when it applies, in this order:

1. `vcs-prepare`: when `vcs.prepare` is unset, the lockfiles that exist at the root, in the order `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock` and `bun.lockb`. With any, it is `[warn] vcs-prepare: <lockfiles joined by ", "> found without vcs.prepare; set vcs.prepare to the install command`.
2. `git-hooks`: the names `hook_names()` gives that are `pre-commit`, `prepare-commit-msg`, `commit-msg` or `post-commit`, in its order. With any, it is `[warn] git-hooks: active commit hooks: <names joined by ", ">; check each runs unattended and leaves the tree as verified`. A read error counts as no hooks.
3. `git-signing`: when `config_value("commit.gpgsign")`, lowercased, is `true`, `1`, `yes` or `on`, it is `[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt`. A read error counts as unset.
4. `gitattributes`: when the root's `.gitattributes` cannot be read as text or does not contain `# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END`, it is `[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init`.
5. `git-line-endings`: the entries of `line_endings()` whose index is `crlf` or `mixed`, in its order. With a count of them, the first `limits.maxListedLineEndings` of their paths joined by `, ` are the names. When more are left than are named, ` and <the number left> more` follows the names. The line is `[warn] git-line-endings: <count> tracked file has CRLF or mixed line endings: <names>; run git add --renormalize . and commit` for one, and the same with `tracked files have` for more than one. A read error counts as no entries.

Last, whatever the cases above, comes `git-env`. It names the variables
among `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`, in that order, that
are set to a non-empty value in the process environment. With one it is
`[warn] git-env: <name> is set; osq's own git reads ignore it while verify commands and hooks do not`.
With more it is
`[warn] git-env: <names joined by " and "> are set; osq's own git reads ignore them while verify commands and hooks do not`.

The git scenarios run `doctor` in a child process of the test binary, as
the show feature's land tests run theirs. The child's environment sets
`GIT_CONFIG_GLOBAL` to `/dev/null`, `GIT_CONFIG_NOSYSTEM` to `1` and
`GIT_CEILING_DIRECTORIES` to the scratch folder, together with the row's
variables. The test builds each repository with the same three settings,
and each root holds the managed files that "Doctor managed blocks" names.

#### Scenario: Doctor git lines
- **WHEN** `doctor` runs with no arguments in the child, on the row's root with the row's `osq.toml` and the row's setup. `<git>` stands for `[ok] git: ` followed by the first line of what `git --version` prints, trimmed. `<vcs>` stands for `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"`. A repository is made with `git init -b main` and `core.autocrlf` set to `false`, and its listed files are committed
- **THEN** doctor returns an output, and its lines after `[ok] done-markers: all done markers verified` are exactly the row's lines:

| Root | osq.toml | Setup | Lines |
|---|---|---|---|
| a folder no repository holds | none | none | `[warn] git: not a git repository; git checks off` |
| the folder `sub` of a repository | none | none | `[warn] git: not the repository root; git checks off` |
| a folder no repository holds | none | the child's `PATH` set to an empty folder | `[warn] git: git not found; git checks off` |
| a repository | none | `pnpm-lock.yaml` `x`, an executable `.git/hooks/pre-commit`, `commit.gpgsign` `true`, `c.txt` `a\r\n` committed | `<git>` |
| a repository | `<vcs>\n\n[limits]\nmaxListedLineEndings = 6` | `pnpm-lock.yaml` `x` and `yarn.lock` `x`; executable `.git/hooks/pre-commit`, `.git/hooks/commit-msg` and `.git/hooks/pre-push`, and a `.git/hooks/post-commit` with mode 644; `commit.gpgsign` `On`; no `.gitattributes`; `c1.txt` to `c7.txt`, each `a\r\n`, committed | `<git>`, `[warn] vcs-prepare: pnpm-lock.yaml, yarn.lock found without vcs.prepare; set vcs.prepare to the install command`, `[warn] git-hooks: active commit hooks: commit-msg, pre-commit; check each runs unattended and leaves the tree as verified`, `[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt`, `[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init`, `[warn] git-line-endings: 7 tracked files have CRLF or mixed line endings: c1.txt, c2.txt, c3.txt, c4.txt, c5.txt, c6.txt and 1 more; run git add --renormalize . and commit` |
| a repository | `<vcs>\nprepare = "pnpm install"` | `pnpm-lock.yaml` `x`; `commit.gpgsign` `false`; `l.txt` `a\n` and `m.txt` `a\r\nb\n` committed, then `.gitattributes` `# keep\n# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n` written | `<git>`, `[warn] git-line-endings: 1 tracked file has CRLF or mixed line endings: m.txt; run git add --renormalize . and commit` |
| a repository | `<vcs>` | `.gitattributes` `# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n` and `l.txt` `a\n` committed | `<git>` |

#### Scenario: Doctor git environment
- **WHEN** `doctor` runs with no arguments in the child on a folder no repository holds, with no `osq.toml`, the managed files, and the row's variables added to the child's environment
- **THEN** doctor returns an output, and its lines after `[ok] done-markers: all done markers verified` are exactly the row's lines:

| Variables | Lines |
|---|---|
| `GIT_DIR` `/nowhere` | `[warn] git: not a git repository; git checks off`, `[warn] git-env: GIT_DIR is set; osq's own git reads ignore it while verify commands and hooks do not` |
| `GIT_DIR` empty, `GIT_INDEX_FILE` `x`, `GIT_WORK_TREE` `y` | `[warn] git: not a git repository; git checks off`, `[warn] git-env: GIT_INDEX_FILE and GIT_WORK_TREE are set; osq's own git reads ignore them while verify commands and hooks do not` |
