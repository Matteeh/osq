## MODIFIED Requirements

### Requirement: Doctor command
`osq-feature-doctor` SHALL expose one public item, `DoctorFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `doctor`, and its `commands()` is
one command with the name `doctor`, the summary `check the configuration
and the pi harness` and the usage `` (empty). The crate depends on
`osq-core`, `osq-kernel-config`, `osq-kernel-harnesses`,
`osq-kernel-storage` and `osq-kernel-vcs`, and on no feature crate.

#### Scenario: Doctor feature commands
- **WHEN** a test reads `DoctorFeature`'s name and commands
- **THEN** the name is `doctor`, and the commands are exactly one, with the name `doctor`, the summary `check the configuration and the pi harness` and an empty usage

### Requirement: Doctor pi checks
`doctor` SHALL print, in this order, the check lines TypeScript's
`osq doctor` prints for the configuration and the pi harness, each as
`[ok] <name>: <message>`, `[warn] <name>: <message>` or
`[fail] <name>: <message>`, and then the change lines rust-doctor
"Doctor change checks" gives:

1. `config`: rust-config `load_config` on the root. On an error it is
   `[fail] config: failed to load: <the ConfigError's display>`, no other
   pi line follows, and the change checks use `Config::default()`, as
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
- **WHEN** `doctor` runs with no arguments on a new scratch root holding the row's `osq.toml`, with `<fake>` standing for the absolute path of `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh` and `<healthy>` for `[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified`, and the row's files, each written with a trailing newline; for `--version` the fake exits 1 when `fake-pi-version-once` and `fake-pi-version-ran` both exist and otherwise creates `fake-pi-version-ran` when `fake-pi-version-once` exists, sleeps 10 seconds when `fake-pi-version-wait` exists, prints `fake-pi-version` to stdout and `fake-pi-version-stderr` to stderr when each exists, and exits with the code in `fake-pi-version-exit`, else 0; for `auth` it prints `fake-pi-auth` when it exists and exits with the code in `fake-pi-auth-exit`, else 0
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

## ADDED Requirements

### Requirement: Doctor change checks
After its configuration and pi lines, `doctor` SHALL print three lines, as
TypeScript's `checkLocks`, `checkArchives` and `checkDoneMarkers` print
them, whatever the lines before them hold. The checks read the project's
change folders through the storage read model only (ADR 022), with the
config `doctor` loaded, or `Config::default()` when it failed to load.

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
- **WHEN** `doctor` runs with no arguments on a new scratch root with no `osq.toml` and the row's files under `openspec/changes/`, with `<dead>` standing for the lock text `{"pid":2147483647,"startedAt":1}`, `<live>` for `{"pid":<the test process's pid>,"startedAt":1}`, `<config>` for `[ok] config: loaded (harness: agy)` and each `.md` file of an archived or rejected folder written as `x`
- **THEN** it returns the row's result, written with `\n` escapes, where an output is `Ok` and a message is a `Failed` error for the command `doctor`:

| Files | Result |
|---|---|
| none | output `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n` |
| `001-a/.run/running/1.pid` `<live>` | output `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified\n` |
| `001-a/.run/running/1.pid` `<dead>`, `001-a/.run/locks/2.pid` `not json`, `001-a/.run/running/notes.txt` `<dead>`, `002-b/.run/running/1.pid` `{"pid":0}`, `archive/003-c/proposal.md`, `archive/003-c/tasks.md`, `archive/003-c/.run/running/1.pid` `<dead>`, `rejected/004-d/.run/running/1.pid` `<dead>` | message `<config>\n[fail] locks: orphaned lock(s): openspec/changes/001-a/.run/running/1.pid, openspec/changes/001-a/.run/locks/2.pid, openspec/changes/002-b/.run/running/1.pid\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified` |
| `archive/002-b/proposal.md`, `archive/003-c/spec.md`, `archive/003-c/tasks/1.md`, `archive/004-d/tasks.md`, `rejected/005-e/x.md` | message `<config>\n[ok] locks: no orphaned locks\n[fail] archives: invalid archive(s): openspec/changes/archive/002-b, openspec/changes/archive/004-d\n[ok] done-markers: all done markers verified` |
| `001-a/.run/done/1.md` `---\nscope_hash: abc\n---\n`, `001-a/.run/done/2.md` `done\n`, `001-a/.run/done/3.md` `---\nmanual: true\nreason: checked by hand\n---\n`, `archive/002-b/proposal.md`, `archive/002-b/tasks.md`, `archive/002-b/.run/done/1.md` `done\n` | message `<config>\n[ok] locks: no orphaned locks\n[ok] archives: all archives valid\n[fail] done-markers: unverified done marker placed by hand: openspec/changes/001-a/.run/done/2.md` |

#### Scenario: Doctor reads every worktree
- **WHEN** `doctor` runs on a scratch git repository `<scratch>/repo` with one commit on `main` and an `osq.toml` of `[vcs]\nenabled = true\nauthor = "osq <osq@example.com>"\nworktreeRoot = "<scratch>/worktrees"\n`, a worktree `<scratch>/worktrees/002-run` added on the new branch `osq/002-run` holding `openspec/changes/002-run/.run/approved` and `openspec/changes/002-run/.run/running/1.pid` as `{"pid":2147483647,"startedAt":1}`, and the checkout holding `openspec/changes/002-run/.run/running/1.pid` with the same text
- **THEN** it fails for the command `doctor` with the message `[ok] config: loaded (harness: agy)\n[fail] locks: orphaned lock(s): ../worktrees/002-run/openspec/changes/002-run/.run/running/1.pid\n[ok] archives: all archives valid\n[ok] done-markers: all done markers verified`
