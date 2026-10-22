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
`osq-core`, `osq-kernel-config` and `osq-kernel-harnesses`, and on no
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
`[fail] <name>: <message>`:

1. `config`: rust-config `load_config` on the root. On an error it is
   `[fail] config: failed to load: <the ConfigError's display>` and no
   other line follows. Otherwise it is
   `[ok] config: loaded (harness: <the executor harness's name>)`, and no
   other line follows unless that harness is `pi`.
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
   `exited with code <code>`, and no other line follows. Otherwise it is
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
- **WHEN** `doctor` runs with no arguments on a new scratch root holding the row's `osq.toml`, with `<fake>` standing for the absolute path of `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`, and the row's files, each written with a trailing newline; for `--version` the fake exits 1 when `fake-pi-version-once` and `fake-pi-version-ran` both exist and otherwise creates `fake-pi-version-ran` when `fake-pi-version-once` exists, sleeps 10 seconds when `fake-pi-version-wait` exists, prints `fake-pi-version` to stdout and `fake-pi-version-stderr` to stderr when each exists, and exits with the code in `fake-pi-version-exit`, else 0; for `auth` it prints `fake-pi-auth` when it exists and exits with the code in `fake-pi-auth-exit`, else 0
- **THEN** each run returns the row's result, written with `\n` escapes, in under 5 seconds, where an output is `Ok` and a message is a `Failed` error for the command `doctor`:

| osq.toml | Files | Result |
|---|---|---|
| none | none | output `[ok] config: loaded (harness: agy)\n` |
| `[pi]\nbin = "  "` | none | message `[fail] config: failed to load: pi.bin must be a non-empty string` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.87.1` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.90.0` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.90.0\n[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version-stderr` `0.87.2` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.2\n[ok] harness-version: Pi 0.87.2 (tested >=0.87.0 <0.88.0)\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | none | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake>\n[warn] harness-version: Pi version "" is outside the tested range >=0.87.0 <0.88.0\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"` | `fake-pi-version` `0.87.1`, `fake-pi-version-exit` `2` | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: <fake> (exited with code 2)` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "/nonexistent/pi"` | none | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: /nonexistent/pi (cannot start /nonexistent/pi: No such file or directory (os error 2))` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\n\n[timeouts]\nharnessPreflightSeconds = 1` | `fake-pi-version-wait` empty | message `[ok] config: loaded (harness: pi)\n[fail] harness: binary unavailable: <fake> (timed out)` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-auth` `{"status":"ready","provider":"deepseek"}` | output `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[ok] harness-auth: deepseek credentials ready\n` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-auth` `{"status":"missing","reason":"No API key found for deepseek"}`, `fake-pi-auth-exit` `1` | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[fail] harness-auth: deepseek credentials not ready: No API key found for deepseek` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.90.0`, `fake-pi-auth-exit` `3` | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.90.0\n[warn] harness-version: Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0\n[fail] harness-auth: deepseek credentials not ready: pi auth check exited with code 3` |
| `[executor]\nharness = "pi"\n\n[pi]\nbin = "<fake>"\nprovider = "deepseek"` | `fake-pi-version` `0.87.1`, `fake-pi-version-once` empty | message `[ok] config: loaded (harness: pi)\n[ok] harness: <fake> 0.87.1\n[ok] harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)\n[fail] harness-auth: deepseek credentials not ready: Pi binary not found or failed: <fake>` |

#### Scenario: Doctor fake pi runs in place
- **WHEN** a test reads the mode of `crates/features/doctor/tests/fixtures/fake-pi/doctor.sh`
- **THEN** the mode has the owner, group and other execute bits set
