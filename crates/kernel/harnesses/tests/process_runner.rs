//! Process runner tests: stdout lines, stderr, folders, timeouts and start errors.

use osq_kernel_harnesses::{ProcessError, ProcessSpec, run_process};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// The longest a row may take before the test calls the runner stuck.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// One row of the "Runs of small scripts" table.
struct RunRow {
    /// The shell script handed to `/bin/sh -c`.
    script: &'static str,
    /// The one declared variable, if the row declares one.
    env: Option<(&'static str, &'static str)>,
    /// The row's timeout, or none.
    timeout: Option<Duration>,
    /// The lines the row's script writes.
    lines: &'static [&'static str],
    /// The expected exit code.
    exit_code: i32,
    /// Whether the run times out.
    timed_out: bool,
}

/// The rows of the "Runs of small scripts" table, in table order.
const RUN_ROWS: &[RunRow] = &[
    RunRow {
        script: "printf 'one\\ntwo\\n'",
        env: None,
        timeout: None,
        lines: &["one", "two"],
        exit_code: 0,
        timed_out: false,
    },
    RunRow {
        script: "exit 7",
        env: None,
        timeout: None,
        lines: &[],
        exit_code: 7,
        timed_out: false,
    },
    RunRow {
        script: "printf 'a\\n\\n   \\nb'",
        env: None,
        timeout: None,
        lines: &["a", "b"],
        exit_code: 0,
        timed_out: false,
    },
    RunRow {
        script: "printf '%s\\n' \"${OSQ_PROBE-unset}\" \"${CARGO_MANIFEST_DIR-unset}\"",
        env: Some(("OSQ_PROBE", "probe")),
        timeout: None,
        lines: &["probe", "unset"],
        exit_code: 0,
        timed_out: false,
    },
    RunRow {
        script: "kill -KILL $$",
        env: None,
        timeout: None,
        lines: &[],
        exit_code: 1,
        timed_out: false,
    },
    RunRow {
        script: "trap 'exit 0' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        env: None,
        timeout: Some(Duration::from_millis(300)),
        lines: &["started"],
        exit_code: 124,
        timed_out: true,
    },
    RunRow {
        script: "trap 'echo stopping; exit 3' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        env: None,
        timeout: Some(Duration::from_millis(300)),
        lines: &["started", "stopping"],
        exit_code: 3,
        timed_out: true,
    },
    RunRow {
        script: "trap '' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        env: None,
        timeout: Some(Duration::from_millis(300)),
        lines: &["started"],
        exit_code: 124,
        timed_out: true,
    },
    RunRow {
        script: "(sleep 10) & echo done",
        env: None,
        timeout: None,
        lines: &["done"],
        exit_code: 0,
        timed_out: false,
    },
];

/// A counter that keeps each test's temporary folder apart.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("process_runner")
        .join(format!("{name}-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// Builds the specification for one table row in a fresh folder.
fn row_spec(folder: &Path, row: &RunRow, kill_grace: Duration) -> ProcessSpec {
    let env = row
        .env
        .map(|(key, value)| (key.to_owned(), value.to_owned()))
        .into_iter()
        .collect::<BTreeMap<_, _>>();
    ProcessSpec {
        program: "/bin/sh".to_owned(),
        args: vec!["-c".to_owned(), row.script.to_owned()],
        cwd: folder.to_path_buf(),
        env,
        timeout: row.timeout,
        kill_grace,
    }
}

/// Runs one row and checks every value the table names.
fn assert_row(row: &RunRow) {
    let folder = temporary_folder("row");
    let mut lines = Vec::new();
    let started = Instant::now();
    let outcome = run_process(
        &row_spec(&folder, row, Duration::from_millis(300)),
        &mut |line| {
            lines.push(line.to_owned());
        },
    )
    .expect("the row's script starts");
    let elapsed = started.elapsed();
    assert_eq!(row.lines, lines, "script {}", row.script);
    assert_eq!(row.exit_code, outcome.exit_code, "script {}", row.script);
    assert_eq!(row.timed_out, outcome.timed_out, "script {}", row.script);
    assert!(
        elapsed < ROW_LIMIT,
        "script {} took {elapsed:?}",
        row.script
    );
}

/// Covers: rust-harnesses/runs-of-small-scripts
#[test]
fn runs_of_small_scripts() {
    assert!(
        std::env::var_os("CARGO_MANIFEST_DIR").is_some(),
        "the test process carries CARGO_MANIFEST_DIR"
    );
    for row in RUN_ROWS {
        assert_row(row);
    }
}

/// Covers: rust-harnesses/runs-of-small-scripts
#[test]
fn stdout_stays_open_for_the_grace_after_exit() {
    let folder = temporary_folder("late-line");
    let spec = ProcessSpec {
        program: "/bin/sh".to_owned(),
        args: vec![
            "-c".to_owned(),
            "(sleep 0.1; echo late; sleep 10) & echo done".to_owned(),
        ],
        cwd: folder,
        env: BTreeMap::new(),
        timeout: None,
        kill_grace: Duration::from_secs(1),
    };
    let mut lines = Vec::new();
    let started = Instant::now();
    let outcome = run_process(&spec, &mut |line| lines.push(line.to_owned()))
        .expect("the background script starts");
    let elapsed = started.elapsed();
    assert_eq!(vec!["done", "late"], lines);
    assert_eq!(0, outcome.exit_code);
    assert!(!outcome.timed_out);
    assert!(elapsed < ROW_LIMIT, "the grace wait took {elapsed:?}");
}

/// Covers: rust-harnesses/stderr-folder-and-stop-timing
#[test]
fn stderr_folder_and_stop_timing() {
    let folder = temporary_folder("folder");
    let canonical = fs::canonicalize(&folder).expect("the folder has a canonical path");
    let spec = ProcessSpec {
        program: "/bin/sh".to_owned(),
        args: vec!["-c".to_owned(), "echo err >&2; pwd -P; exit 2".to_owned()],
        cwd: folder,
        env: BTreeMap::new(),
        timeout: None,
        kill_grace: Duration::from_millis(300),
    };
    let mut lines = Vec::new();
    let outcome = run_process(&spec, &mut |line| lines.push(line.to_owned()))
        .expect("the first script starts");
    assert_eq!(2, outcome.exit_code);
    assert!(!outcome.timed_out);
    assert_eq!("err\n", outcome.stderr);
    assert_eq!(vec![canonical.to_string_lossy().into_owned()], lines);

    let row = RunRow {
        script: "trap 'echo stopping; exit 3' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        env: None,
        timeout: Some(Duration::from_millis(300)),
        lines: &["started", "stopping"],
        exit_code: 3,
        timed_out: true,
    };
    let folder = temporary_folder("stop");
    let mut lines = Vec::new();
    let started = Instant::now();
    let outcome = run_process(
        &row_spec(&folder, &row, Duration::from_secs(5)),
        &mut |line| {
            lines.push(line.to_owned());
        },
    )
    .expect("the stop script starts");
    let elapsed = started.elapsed();
    assert_eq!(row.lines, lines);
    assert_eq!(3, outcome.exit_code);
    assert!(outcome.timed_out);
    assert!(elapsed < ROW_LIMIT, "the stop took {elapsed:?}");
}

/// Covers: rust-harnesses/stderr-folder-and-stop-timing
#[test]
fn stop_grace_precedes_kill() {
    let row = RunRow {
        script: "trap 'sleep 0.1; echo stopping; exit 3' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        env: None,
        timeout: Some(Duration::from_millis(300)),
        lines: &["started", "stopping"],
        exit_code: 3,
        timed_out: true,
    };
    let folder = temporary_folder("grace");
    let mut lines = Vec::new();
    let started = Instant::now();
    let outcome = run_process(
        &row_spec(&folder, &row, Duration::from_secs(1)),
        &mut |line| {
            lines.push(line.to_owned());
        },
    )
    .expect("the grace script starts");
    let elapsed = started.elapsed();
    assert_eq!(row.lines, lines);
    assert_eq!(3, outcome.exit_code);
    assert!(outcome.timed_out);
    assert!(elapsed < ROW_LIMIT, "the grace stop took {elapsed:?}");
}

/// Covers: rust-harnesses/program-that-cannot-start
#[test]
fn program_that_cannot_start() {
    let mut lines = Vec::new();
    let result = run_process(
        &ProcessSpec {
            program: "/nonexistent/osq-program".to_owned(),
            args: Vec::new(),
            cwd: temporary_folder("missing"),
            env: BTreeMap::new(),
            timeout: None,
            kill_grace: Duration::from_millis(300),
        },
        &mut |line| lines.push(line.to_owned()),
    );
    let error = result.expect_err("a missing program cannot start");
    assert!(lines.is_empty(), "on_line received {lines:?}");
    match &error {
        ProcessError::Spawn { program, message } => {
            assert_eq!("/nonexistent/osq-program", program);
            assert!(!message.is_empty(), "the operating system names the error");
        }
    }
    assert_eq!(
        "cannot start /nonexistent/osq-program: ".to_owned()
            + match &error {
                ProcessError::Spawn { message, .. } => message,
            },
        error.to_string()
    );
}
