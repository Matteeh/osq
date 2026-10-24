//! Proves the task history reader matches TypeScript's report observers.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    PreSpawnHistory, RetryGroup, ScopeHistory, StartCount, TaskHistory, read_task_history,
};

/// The task every row reads.
const TASK: &str = "1";

/// A `started` event.
const STARTED: &str = r#"{"type":"started","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `started` event reporting a cost.
const STARTED_TENTH: &str =
    r#"{"type":"started","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":0.1}}"#;

/// A `started` event reporting a quarter.
const STARTED_QUARTER: &str =
    r#"{"type":"started","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":0.25}}"#;

/// A `dead` event whose reason has surrounding spaces.
const DEAD_TIMEOUT: &str =
    r#"{"type":"dead","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":" timeout "}}"#;

/// A `dead` event whose reason is whitespace.
const DEAD_SPACE: &str =
    r#"{"type":"dead","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"  "}}"#;

/// A `dead` event whose reason is a number.
const DEAD_NUMBER: &str =
    r#"{"type":"dead","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":7}}"#;

/// A `dead` event with no data members.
const DEAD: &str = r#"{"type":"dead","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `regressed` event for a red verify.
const REGRESSED_VERIFY: &str =
    r#"{"type":"regressed","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"verify_red"}}"#;

/// A `verify_ran` event with the exit code 1.
const VERIFY_ONE: &str =
    r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"exitCode":1}}"#;

/// A `verify_ran` event with no data members.
const VERIFY: &str = r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `verify_ran` event whose exit code is a string.
const VERIFY_STRING: &str =
    r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"exitCode":"0"}}"#;

/// A `verify_ran` event with the exit code 2.5.
const VERIFY_FRACTION: &str =
    r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"exitCode":2.5}}"#;

/// A pre-spawn run declaring red that matched paths and passed.
const PRE_RED: &str = r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"phase":"pre_spawn","expected":"red","exitCode":0,"mismatch":true,"missingPaths":["a"]}}"#;

/// A pre-spawn run declaring green that failed with no missing paths.
const PRE_GREEN: &str = r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"phase":"pre_spawn","expected":"green","exitCode":1,"missingPaths":[]}}"#;

/// A pre-spawn run declaring any with a non-boolean mismatch.
const PRE_ANY: &str = r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"phase":"pre_spawn","expected":"any","exitCode":0,"mismatch":"yes"}}"#;

/// A pre-spawn run declaring a start the report does not count.
const PRE_BLUE: &str = r#"{"type":"verify_ran","timestamp":"2026-10-21T08:00:00.000Z","data":{"phase":"pre_spawn","expected":"blue","exitCode":0}}"#;

/// A `tokens` event reporting half.
const TOKENS_HALF: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":0.5}}"#;

/// A `tokens` event reporting a fifth.
const TOKENS_FIFTH: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":0.2}}"#;

/// A `tokens` event reporting three tenths.
const TOKENS_THREE_TENTHS: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":0.3}}"#;

/// A `tokens` event reporting nine.
const TOKENS_NINE: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":9}}"#;

/// A `done` event whose cost is a string.
const DONE_STRING_COST: &str =
    r#"{"type":"done","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":"1"}}"#;

/// A `done` event with no data members.
const DONE: &str = r#"{"type":"done","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `done` event reporting the cost 2.
const DONE_COST_TWO: &str =
    r#"{"type":"done","timestamp":"2026-10-21T08:00:00.000Z","data":{"cost":2}}"#;

/// An automatic `retry` event.
const RETRY_AUTOMATIC: &str =
    r#"{"type":"retry","timestamp":"2026-10-21T08:00:00.000Z","data":{"automatic":true}}"#;

/// A `retry` event whose automatic flag is a string.
const RETRY_STRING: &str =
    r#"{"type":"retry","timestamp":"2026-10-21T08:00:00.000Z","data":{"automatic":"true"}}"#;

/// A `retry` event with no data members.
const RETRY: &str = r#"{"type":"retry","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `stuck` event.
const STUCK: &str = r#"{"type":"stuck","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A scope regression whose detection verify passed.
const REGRESSED_SCOPE_PASSED: &str = r#"{"type":"regressed","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"scope_regression","exitCode":0}}"#;

/// A scope regression whose detection verify failed.
const REGRESSED_SCOPE_FAILED: &str = r#"{"type":"regressed","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"scope_regression","exitCode":3}}"#;

/// A scope regression with no detection exit code.
const REGRESSED_SCOPE: &str = r#"{"type":"regressed","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"scope_regression"}}"#;

/// A red-verify regression, which is not a scope regression.
const REGRESSED_RED: &str = r#"{"type":"regressed","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"verify_red","exitCode":0}}"#;

/// An automatic passed recertification.
const RECERTIFIED_AUTOMATICALLY: &str = r#"{"type":"recertification","timestamp":"2026-10-21T08:00:00.000Z","data":{"outcome":"passed","automatic":true}}"#;

/// A human passed recertification.
const RECERTIFIED: &str = r#"{"type":"recertification","timestamp":"2026-10-21T08:00:00.000Z","data":{"outcome":"passed"}}"#;

/// A passed recertification whose automatic flag is a string.
const RECERTIFIED_STRING: &str = r#"{"type":"recertification","timestamp":"2026-10-21T08:00:00.000Z","data":{"outcome":"passed","automatic":"true"}}"#;

/// A requeued recertification.
const REQUEUED: &str = r#"{"type":"recertification","timestamp":"2026-10-21T08:00:00.000Z","data":{"outcome":"requeued"}}"#;

/// A recertification with no data members.
const RECERTIFICATION: &str =
    r#"{"type":"recertification","timestamp":"2026-10-21T08:00:00.000Z","data":{}}"#;

/// A `started` event whose data is an array.
const LOOSE_STARTED: &str = r#"{"type":"started","data":[1]}"#;

/// A `dead` event whose data is a string.
const LOOSE_DEAD: &str = r#"{"type":"dead","data":"x"}"#;

/// One row of the "Task histories" table.
struct Row {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The event file's lines, in order; empty for no event file.
    lines: &'static [&'static str],
    /// The history the row expects.
    expected: TaskHistory,
}

/// The rows that count attempts, dead reasons and verify runs.
fn basic_rows() -> Vec<Row> {
    vec![
        Row {
            name: "no-event-file",
            lines: &[],
            expected: TaskHistory::default(),
        },
        Row {
            name: "two-starts",
            lines: &[STARTED, STARTED],
            expected: TaskHistory {
                attempts: 2,
                unexplained: 1,
                ..TaskHistory::default()
            },
        },
        Row {
            name: "explained-starts",
            lines: &[STARTED, DEAD_TIMEOUT, STARTED, REGRESSED_VERIFY, STARTED],
            expected: TaskHistory {
                attempts: 3,
                dead_reasons: vec!["timeout".to_owned()],
                ..TaskHistory::default()
            },
        },
        Row {
            name: "unknown-dead-reasons",
            lines: &[DEAD_SPACE, DEAD_NUMBER, DEAD],
            expected: TaskHistory {
                dead_reasons: vec![
                    "unknown".to_owned(),
                    "unknown".to_owned(),
                    "unknown".to_owned(),
                ],
                ..TaskHistory::default()
            },
        },
        Row {
            name: "verify-codes",
            lines: &[VERIFY_ONE, VERIFY, VERIFY_STRING, VERIFY_FRACTION],
            expected: TaskHistory {
                verify_codes: vec![Some(1.0), None, None, Some(2.5)],
                ..TaskHistory::default()
            },
        },
    ]
}

/// The row that counts pre-spawn verify runs and their declared starts.
fn pre_spawn_row() -> Row {
    Row {
        name: "pre-spawn",
        lines: &[PRE_RED, PRE_GREEN, PRE_ANY, PRE_BLUE],
        expected: TaskHistory {
            pre_spawn: PreSpawnHistory {
                runs: 4,
                mismatches: 1,
                missing_path_runs: 1,
                red: StartCount { runs: 1, passed: 1 },
                green: StartCount { runs: 1, passed: 0 },
                any: StartCount { runs: 1, passed: 1 },
            },
            ..TaskHistory::default()
        },
    }
}

/// The rows that count costs and retries.
fn cost_rows() -> Vec<Row> {
    vec![
        Row {
            name: "costs",
            lines: &[
                TOKENS_HALF,
                STARTED_TENTH,
                TOKENS_FIFTH,
                STARTED,
                DONE_STRING_COST,
                STARTED,
                TOKENS_THREE_TENTHS,
            ],
            expected: TaskHistory {
                attempts: 3,
                unexplained: 2,
                costs: vec![0.5, 0.1, 0.2, 0.3],
                cost_reported_attempts: 2,
                ..TaskHistory::default()
            },
        },
        Row {
            name: "retries",
            lines: &[
                TOKENS_NINE,
                RETRY_AUTOMATIC,
                STARTED_QUARTER,
                DONE,
                DONE,
                RETRY,
                STUCK,
                TOKENS_HALF,
                TOKENS_HALF,
                RETRY_STRING,
                DONE_COST_TWO,
            ],
            expected: TaskHistory {
                attempts: 1,
                costs: vec![9.0, 0.25, 0.5, 0.5, 2.0],
                cost_reported_attempts: 1,
                automatic: RetryGroup {
                    count: 1,
                    reached_done: 1,
                    cost: 0.25,
                    cost_reported_attempts: 1,
                },
                manual: RetryGroup {
                    count: 2,
                    reached_done: 1,
                    cost: 1.0,
                    cost_reported_attempts: 1,
                },
                stuck: 1,
                ..TaskHistory::default()
            },
        },
    ]
}

/// The rows that count scope regressions and pass over loose lines.
fn scope_rows() -> Vec<Row> {
    vec![
        Row {
            name: "scope",
            lines: &[
                REGRESSED_SCOPE_PASSED,
                REGRESSED_SCOPE_FAILED,
                REGRESSED_SCOPE,
                REGRESSED_RED,
                RECERTIFIED_AUTOMATICALLY,
                RECERTIFIED,
                RECERTIFIED_STRING,
                REQUEUED,
                RECERTIFICATION,
            ],
            expected: TaskHistory {
                scope: ScopeHistory {
                    detected: 3,
                    passed_at_detection: 1,
                    failed_at_detection: 1,
                    recertified_by_human: 2,
                    recertified_automatically: 1,
                    requeued_for_agent: 1,
                },
                ..TaskHistory::default()
            },
        },
        Row {
            name: "loose-lines",
            lines: &["", "not json", "[1]", "   ", LOOSE_STARTED, LOOSE_DEAD],
            expected: TaskHistory {
                attempts: 1,
                dead_reasons: vec!["unknown".to_owned()],
                ..TaskHistory::default()
            },
        },
    ]
}

/// Every "Task histories" row, in the table's order.
fn rows() -> Vec<Row> {
    let mut rows = basic_rows();
    rows.push(pre_spawn_row());
    rows.extend(cost_rows());
    rows.extend(scope_rows());
    rows
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`.
fn scratch(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_task_history")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes the row's event lines into `folder`.
fn write_events(folder: &Path, lines: &[&str]) {
    if lines.is_empty() {
        return;
    }
    let events = folder.join(".run").join("events");
    fs::create_dir_all(&events).expect("the events folder is created");
    let mut content = lines.join("\n");
    content.push('\n');
    fs::write(events.join("1.jsonl"), content).expect("the event file is written");
}

/// Proves detection exit codes are split by the number 0, not just swapped.
///
/// Covers: rust-storage/task-histories
#[test]
fn scope_detection_exit_codes() {
    let folder = scratch("scope_detection_exit_codes", "mixed");
    write_events(
        &folder,
        &[
            REGRESSED_SCOPE_PASSED,
            REGRESSED_SCOPE_PASSED,
            REGRESSED_SCOPE_FAILED,
        ],
    );
    let history = read_task_history(&folder, TASK);
    assert_eq!(history.scope.detected, 3);
    assert_eq!(history.scope.passed_at_detection, 2);
    assert_eq!(history.scope.failed_at_detection, 1);
}

/// Proves every row of the "Task histories" table.
///
/// Covers: rust-storage/task-histories
#[test]
fn task_histories() {
    for row in rows() {
        let folder = scratch("task_histories", row.name);
        write_events(&folder, row.lines);
        assert_eq!(
            read_task_history(&folder, TASK),
            row.expected,
            "{}",
            row.name
        );
    }
}
