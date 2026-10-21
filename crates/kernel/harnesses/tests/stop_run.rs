//! Stop after a line tests: SIGTERM, SIGKILL and a program that never settles.

use osq_kernel_harnesses::{ProcessSpec, run_process_until};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// The longest a row may take before the test calls the runner stuck.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// The grace every row gives the process runner.
const KILL_GRACE: Duration = Duration::from_millis(300);

/// One row of the "Stop after a settled line" table.
struct Row {
    /// The row's name.
    name: &'static str,
    /// The shell script handed to `/bin/sh -c`.
    script: &'static str,
    /// The lines the row's script writes.
    lines: &'static [&'static str],
    /// The expected exit code.
    exit_code: i32,
    /// The least time the run may take, or none.
    least: Option<Duration>,
}

/// The rows of the "Stop after a settled line" table, in table order.
const ROWS: &[Row] = &[
    Row {
        name: "settled-trap-exits-with-five",
        script: "trap 'echo stopping; exit 5' TERM; echo settled; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        lines: &["settled", "stopping"],
        exit_code: 5,
        least: Some(Duration::from_millis(300)),
    },
    Row {
        name: "settled-ignored-term-is-killed",
        script: "trap '' TERM; echo settled; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done",
        lines: &["settled"],
        exit_code: 1,
        least: Some(Duration::from_millis(600)),
    },
    Row {
        name: "settled-then-exit-keeps-the-later-line",
        script: "echo settled; echo after",
        lines: &["settled", "after"],
        exit_code: 0,
        least: None,
    },
    Row {
        name: "working-never-stops-until-it-exits",
        script: "trap 'echo stopping; exit 5' TERM; echo working; i=0; while [ $i -lt 10 ]; do sleep 0.1; i=$((i+1)); done",
        lines: &["working"],
        exit_code: 0,
        least: Some(Duration::from_millis(900)),
    },
];

/// A counter that keeps each row's temporary folder apart.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("stop_run")
        .join(format!("{name}-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// Builds the process request for one row in a fresh folder.
fn row_spec(folder: &Path, row: &Row) -> ProcessSpec {
    ProcessSpec {
        program: "/bin/sh".to_owned(),
        args: vec!["-c".to_owned(), row.script.to_owned()],
        cwd: folder.to_path_buf(),
        env: BTreeMap::new(),
        timeout: None,
        kill_grace: KILL_GRACE,
    }
}

/// Runs one row and checks every value the table names.
fn assert_row(row: &Row) {
    let folder = temporary_folder(row.name);
    let mut lines = Vec::new();
    let started = Instant::now();
    let outcome = run_process_until(&row_spec(&folder, row), &mut |line| {
        lines.push(line.to_owned());
        line == "settled"
    })
    .expect("the row's script starts");
    let elapsed = started.elapsed();
    assert_eq!(row.lines, lines, "row {}", row.name);
    assert_eq!(row.exit_code, outcome.exit_code, "row {}", row.name);
    assert!(!outcome.timed_out, "row {} timed out", row.name);
    assert!(elapsed < ROW_LIMIT, "row {} took {elapsed:?}", row.name);
    if let Some(least) = row.least {
        assert!(
            elapsed >= least,
            "row {} returned in {elapsed:?}, before {least:?}",
            row.name
        );
    }
}

/// Covers: rust-harnesses/stop-after-a-settled-line
#[test]
fn stop_after_a_settled_line() {
    for row in ROWS {
        assert_row(row);
    }
}
