//! Verify command tests: small commands, process groups, environment, spawn errors and duration.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use osq_kernel_harnesses::{ProcessError, VerifyRequest, run_verify};

/// The longest a row may take before the test calls the runner stuck.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// The grace every row gives a process after it exits or a timeout stops it.
const GRACE: Duration = Duration::from_millis(300);

/// The longest an extra output command may take with its short grace.
const EXTRA_LIMIT: Duration = Duration::from_secs(1);

/// One row of the "Verify runs of small commands" table.
struct RunRow {
    /// The shell script handed to `/bin/sh -c`.
    command: &'static str,
    /// The row's timeout, or none.
    timeout: Option<Duration>,
    /// The combined output the row writes.
    output: &'static str,
    /// The expected exit code.
    exit_code: i32,
    /// Whether the run times out.
    timed_out: bool,
}

/// The rows of the "Verify runs of small commands" table, in table order.
const RUN_ROWS: &[RunRow] = &[
    RunRow {
        command: "echo out; sleep 0.2; echo err >&2; exit 3",
        timeout: None,
        output: "out\nerr\n",
        exit_code: 3,
        timed_out: false,
    },
    RunRow {
        command: "printf 'a\\n\\n   \\nb'",
        timeout: None,
        output: "a\n\n   \nb",
        exit_code: 0,
        timed_out: false,
    },
    RunRow {
        command: "kill -KILL $$",
        timeout: None,
        output: "",
        exit_code: 1,
        timed_out: false,
    },
    RunRow {
        command: "echo started; sleep 10",
        timeout: Some(Duration::from_millis(300)),
        output: "started\n",
        exit_code: 1,
        timed_out: true,
    },
    RunRow {
        command: "(sleep 10) & echo done",
        timeout: None,
        output: "done\n",
        exit_code: 0,
        timed_out: false,
    },
    RunRow {
        command: "pwd -P; echo \"$(pwd -P)/src/a.rs:1\"",
        timeout: None,
        output: ".\nsrc/a.rs:1\n",
        exit_code: 0,
        timed_out: false,
    },
];

/// One row of the "Verify variables" table.
struct VariableRow {
    /// The source variables.
    source: &'static [(&'static str, &'static str)],
    /// The change folder the request names, or none.
    change: Option<&'static str>,
    /// The diff file the request names, or none.
    diff: Option<&'static str>,
    /// The extra variables set last.
    extra: &'static [(&'static str, &'static str)],
    /// The six lines the command prints.
    lines: [&'static str; 6],
}

/// The rows of the "Verify variables" table, in table order.
const VARIABLE_ROWS: &[VariableRow] = &[
    VariableRow {
        source: &[
            ("DEEPSEEK_API_KEY", "sk-model"),
            ("ANTHROPIC_API_KEY", "sk-ant"),
            ("CI", "true"),
        ],
        change: Some("/p/openspec/changes/001-a"),
        diff: Some("/tmp/d/change.patch"),
        extra: &[],
        lines: [
            "/p/openspec/changes/001-a",
            "/tmp/d/change.patch",
            "unset",
            "unset",
            "unset",
            "true",
        ],
    },
    VariableRow {
        source: &[("OSQ_CHANGE", "/stale"), ("OSQ_DIFF", "/stale")],
        change: None,
        diff: None,
        extra: &[],
        lines: ["unset", "unset", "unset", "unset", "unset", "unset"],
    },
    VariableRow {
        source: &[],
        change: Some("/p/c"),
        diff: None,
        extra: &[("OSQ_MUTANT", "1"), ("OSQ_CHANGE", "/x")],
        lines: ["/x", "unset", "1", "unset", "unset", "unset"],
    },
];

/// The command the "Verify variables" rows run.
const VARIABLE_COMMAND: &str = "printf '%s\\n' \"${OSQ_CHANGE-unset}\" \"${OSQ_DIFF-unset}\" \"${OSQ_MUTANT-unset}\" \"${DEEPSEEK_API_KEY-unset}\" \"${ANTHROPIC_API_KEY-unset}\" \"${CI-unset}\"";

/// A counter that keeps each test's temporary folder apart.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("verify_command")
        .join(format!("{name}-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// The test process's PATH, the only source variable a row needs to find tools.
fn path_env() -> BTreeMap<String, String> {
    let path = std::env::var("PATH").expect("the test process has PATH");
    BTreeMap::from([("PATH".to_owned(), path)])
}

/// Builds a request for one command in a fresh, canonical folder.
fn request(command: &str, folder: &Path, timeout: Option<Duration>) -> VerifyRequest {
    VerifyRequest {
        command: command.to_owned(),
        cwd: fs::canonicalize(folder).expect("the folder has a canonical path"),
        source_env: path_env(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: None,
        diff: None,
        extra_env: BTreeMap::new(),
        timeout,
        kill_grace: GRACE,
    }
}

/// Builds a string map from literal pairs.
fn map(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect()
}

/// Runs one extra command in a fresh folder and checks its output and exit.
fn assert_output(command: &str, output: &str) {
    let folder = temporary_folder("extra");
    let started = Instant::now();
    let outcome = run_verify(&request(command, &folder, None)).expect("the extra command starts");
    let elapsed = started.elapsed();
    assert_eq!(output, outcome.output, "command {command}");
    assert_eq!(0, outcome.exit_code, "command {command}");
    assert!(!outcome.timed_out, "command {command}");
    assert!(elapsed < EXTRA_LIMIT, "command {command} took {elapsed:?}");
}

/// Runs one row and checks every value the table names.
fn assert_run_row(row: &RunRow) {
    let folder = temporary_folder("row");
    let started = Instant::now();
    let outcome =
        run_verify(&request(row.command, &folder, row.timeout)).expect("the row's command starts");
    let elapsed = started.elapsed();
    assert_eq!(row.output, outcome.output, "command {}", row.command);
    assert_eq!(row.exit_code, outcome.exit_code, "command {}", row.command);
    assert_eq!(row.timed_out, outcome.timed_out, "command {}", row.command);
    assert!(
        elapsed < ROW_LIMIT,
        "command {} took {elapsed:?}",
        row.command
    );
}

/// Covers: rust-harnesses/verify-runs-of-small-commands
#[test]
fn verify_runs_of_small_commands() {
    for row in RUN_ROWS {
        assert_run_row(row);
    }
    let folder = temporary_folder("prefix");
    let canonical = fs::canonicalize(&folder).expect("the folder has a canonical path");
    let outcome = run_verify(&request("printf '%sX\\n' \"$(pwd -P)\"", &folder, None))
        .expect("the prefix command starts");
    assert_eq!(format!("{}X\n", canonical.display()), outcome.output);
    assert_eq!(0, outcome.exit_code);
    assert!(!outcome.timed_out);
    assert_output("printf '%s:\\n' \"$(pwd -P)\"", ".:\n");
    assert_output("(sleep 0.1; echo late) & echo done", "done\nlate\n");
    assert_output("exec 2>&-; (sleep 2) & echo done", "done\n");
    assert_output("exec 1>&-; (sleep 2 >&2) & echo err >&2", "err\n");
}

/// Covers: rust-harnesses/verify-stops-the-whole-group
#[test]
fn verify_stops_the_whole_group() {
    let folder = temporary_folder("group");
    let outcome = run_verify(&request(
        "sh -c 'sleep 1; echo late > late.txt' & echo started; wait",
        &folder,
        Some(Duration::from_millis(300)),
    ))
    .expect("the group command starts");
    assert!(outcome.timed_out);
    assert_eq!(1, outcome.exit_code);
    assert_eq!("started\n", outcome.output);
    std::thread::sleep(Duration::from_millis(1500));
    assert!(
        !folder.join("late.txt").exists(),
        "the background command still ran after the timeout"
    );
    let folder = temporary_folder("term");
    let outcome = run_verify(&request(
        "trap 'echo term > term.txt; exit 0' TERM; echo started; while :; do :; done",
        &folder,
        Some(Duration::from_millis(300)),
    ))
    .expect("the trap command starts");
    assert!(outcome.timed_out);
    assert_eq!(1, outcome.exit_code);
    assert_eq!("started\n", outcome.output);
    assert!(
        folder.join("term.txt").exists(),
        "the command did not receive SIGTERM before the grace ran out"
    );
    let folder = temporary_folder("kill");
    let started = Instant::now();
    let outcome = run_verify(&request(
        "trap '' TERM; echo started; sleep 2",
        &folder,
        Some(Duration::from_millis(300)),
    ))
    .expect("the ignoring command starts");
    let elapsed = started.elapsed();
    assert!(outcome.timed_out);
    assert_eq!(1, outcome.exit_code);
    assert_eq!("started\n", outcome.output);
    assert!(
        elapsed >= Duration::from_millis(600),
        "the kill ignored the grace: {elapsed:?}"
    );
    assert!(
        elapsed < Duration::from_secs(1),
        "the kill took {elapsed:?}"
    );
}

/// Covers: rust-harnesses/verify-shell-that-cannot-start
#[test]
fn verify_shell_that_cannot_start() {
    let folder = temporary_folder("missing");
    let request = VerifyRequest {
        command: "true".to_owned(),
        cwd: folder.join("does-not-exist"),
        source_env: path_env(),
        configured_env: Vec::new(),
        agent_env: Vec::new(),
        change: None,
        diff: None,
        extra_env: BTreeMap::new(),
        timeout: None,
        kill_grace: GRACE,
    };
    let error = run_verify(&request).expect_err("a missing folder cannot be entered");
    match &error {
        ProcessError::Spawn { program, message } => {
            assert_eq!("/bin/sh", program);
            assert!(!message.is_empty(), "the operating system names the error");
        }
    }
}

/// Covers: rust-harnesses/verify-variables
#[test]
fn verify_variables() {
    for (index, row) in VARIABLE_ROWS.iter().enumerate() {
        let folder = temporary_folder("variables");
        let request = VerifyRequest {
            command: VARIABLE_COMMAND.to_owned(),
            cwd: fs::canonicalize(&folder).expect("the folder has a canonical path"),
            source_env: map(row.source),
            configured_env: vec!["DEEPSEEK_API_KEY".to_owned(), "CI".to_owned()],
            agent_env: vec![
                "DEEPSEEK_API_KEY".to_owned(),
                "ANTHROPIC_API_KEY".to_owned(),
            ],
            change: row.change.map(str::to_owned),
            diff: row.diff.map(str::to_owned),
            extra_env: map(row.extra),
            timeout: None,
            kill_grace: GRACE,
        };
        let outcome = run_verify(&request).expect("the variable command starts");
        let mut expected = String::new();
        for line in row.lines {
            expected.push_str(line);
            expected.push('\n');
        }
        assert_eq!(expected, outcome.output, "variable row {index}");
        assert_eq!(0, outcome.exit_code, "variable row {index}");
        assert!(!outcome.timed_out, "variable row {index}");
    }
}

/// Covers: rust-harnesses/verify-outcome-duration
#[test]
fn verify_outcome_duration() {
    let folder = temporary_folder("duration");
    let started = Instant::now();
    let outcome =
        run_verify(&request("sleep 0.3", &folder, None)).expect("the duration command starts");
    let elapsed = started.elapsed();
    assert!(
        outcome.duration >= Duration::from_millis(300),
        "the outcome duration is {:?}",
        outcome.duration
    );
    assert!(
        outcome.duration < ROW_LIMIT,
        "the outcome duration is {:?}",
        outcome.duration
    );
    assert_eq!(0, outcome.exit_code);
    assert!(!outcome.timed_out);
    assert!(elapsed < ROW_LIMIT, "the run took {elapsed:?}");
}
