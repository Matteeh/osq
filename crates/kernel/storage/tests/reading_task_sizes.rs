//! Proves the task-size reader matches TypeScript's report measurements.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{ScopeResolver, TaskSize, read_task_sizes};

/// The task file every row writes, with one title and three acceptance items.
const TASK_TEXT: &str = "---\ntitle: When one runs, it passes\n---\n\n## Acceptance\n\n\
- [ ] It starts.\n- [ ] It runs.\n- [ ] It passes.\n";

/// One row of the "Task sizes of task streams" table.
struct Row {
    /// The scratch folder's name and the assertion's label.
    name: &'static str,
    /// The event file's lines, in order.
    lines: Vec<String>,
    /// The sizes the row expects.
    expected: Vec<TaskSize>,
}

/// One event line with the given type, timestamp and data.
fn event(kind: &str, timestamp: &str, data: &str) -> String {
    format!(r#"{{"type":"{kind}","timestamp":"{timestamp}","data":{data}}}"#)
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`.
fn scratch(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_task_sizes")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent")).expect("the parent is made");
    fs::write(path, text).expect("the file is written");
}

/// Writes the row's event lines as `events/<task>.jsonl`.
fn write_events(folder: &Path, task: &str, lines: &[String]) {
    let mut content = lines.join("\n");
    content.push('\n');
    write(
        &folder
            .join(".run")
            .join("events")
            .join(format!("{task}.jsonl")),
        &content,
    );
}

/// The first row's lines: one measured, passing legacy task.
fn first_row_lines() -> Vec<String> {
    vec![
        event(
            "measures",
            "2026-10-20T08:00:00.000Z",
            r#"{"phase":"start","scopeFiles":2}"#,
        ),
        event("started", "2026-10-20T08:00:01.000Z", "{}"),
        event("done", "2026-10-20T08:01:00.000Z", "{}"),
        event("measures", "2026-10-20T08:01:00.000Z", r#"{"phase":"end"}"#),
    ]
}

/// The single-row size for task `1`, from the row's measured fields.
fn size(
    scope_files: f64,
    resolver: ScopeResolver,
    attempts: u64,
    first_attempt_pass: bool,
    duration_ms: Option<i64>,
) -> TaskSize {
    TaskSize {
        task: String::from("1"),
        title: String::from("When one runs, it passes"),
        acceptance_lines: 3,
        scope_files,
        resolver,
        attempts,
        first_attempt_pass,
        duration_ms,
    }
}

/// The first five rows of the "Task sizes of task streams" table.
fn basic_rows() -> Vec<Row> {
    vec![
        Row {
            name: "legacy",
            lines: first_row_lines(),
            expected: vec![size(2.0, ScopeResolver::Legacy, 1, true, Some(60_000))],
        },
        Row {
            name: "resolver-2",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":3,"scopeResolver":2}"#,
                ),
                event("started", "2026-10-20T08:00:05.000Z", "{}"),
                event("done", "2026-10-20T08:30:00.000Z", "{}"),
                event(
                    "measures",
                    "2026-10-20T08:30:00.000Z",
                    r#"{"phase":"end","scopeHashes":{"a":"1","b":"2","c":"3","d":"4","e":"5","f":"6","g":"7","h":"8","i":"9"}}"#,
                ),
            ],
            expected: vec![size(9.0, ScopeResolver::Second, 1, true, Some(1_800_000))],
        },
        Row {
            name: "other-resolver",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":1,"scopeResolver":3}"#,
                ),
                event("started", "2026-10-20T08:00:01.000Z", "{}"),
                event("done", "2026-10-20T08:06:00.000Z", "{}"),
            ],
            expected: vec![size(1.0, ScopeResolver::Other, 1, true, None)],
        },
        Row {
            name: "null-resolver",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":1,"scopeResolver":null}"#,
                ),
                event("started", "2026-10-20T08:00:01.000Z", "{}"),
            ],
            expected: vec![size(1.0, ScopeResolver::Other, 1, false, None)],
        },
        Row {
            name: "two-attempts",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":5}"#,
                ),
                event("started", "2026-10-20T08:00:01.000Z", "{}"),
                event("dead", "2026-10-20T08:02:00.000Z", "{}"),
                event("measures", "2026-10-20T08:02:00.000Z", r#"{"phase":"end"}"#),
                String::from("not json"),
                event("started", "2026-10-20T08:10:00.000Z", "{}"),
                event(
                    "measures",
                    "2026-10-20T08:10:00.000Z",
                    r#"{"phase":"start","scopeFiles":6}"#,
                ),
                event("done", "2026-10-20T08:12:00.000Z", "{}"),
                event("measures", "2026-10-20T08:12:30.000Z", r#"{"phase":"end"}"#),
            ],
            expected: vec![size(5.0, ScopeResolver::Legacy, 2, false, Some(270_000))],
        },
    ]
}

/// The remaining rows of the "Task sizes of task streams" table.
fn edge_rows() -> Vec<Row> {
    vec![
        Row {
            name: "invalid-then-valid-start",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":-1}"#,
                ),
                event(
                    "measures",
                    "2026-10-20T08:00:01.000Z",
                    r#"{"phase":"start","scopeFiles":4}"#,
                ),
                event("started", "2026-10-20T08:00:02.000Z", "{}"),
                event("regressed", "2026-10-20T08:00:03.000Z", "{}"),
                event("done", "2026-10-20T08:00:04.000Z", "{}"),
            ],
            expected: vec![size(4.0, ScopeResolver::Legacy, 1, false, None)],
        },
        Row {
            name: "zero-duration",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"start","scopeFiles":2}"#,
                ),
                event(
                    "measures",
                    "2026-10-20T08:00:00.000Z",
                    r#"{"phase":"end","scopeHashes":["a"]}"#,
                ),
                event("started", "2026-10-20T08:00:01.000Z", "{}"),
                event("done", "2026-10-20T08:00:02.000Z", "{}"),
            ],
            expected: vec![size(2.0, ScopeResolver::Legacy, 1, true, Some(0))],
        },
        Row {
            name: "bad-measure-timestamps",
            lines: vec![
                event(
                    "measures",
                    "2026-10-20T08:05:00.000Z",
                    r#"{"phase":"start","scopeFiles":2}"#,
                ),
                event("measures", "2026-10-20T08:04:00.000Z", r#"{"phase":"end"}"#),
                event("measures", "bad", r#"{"phase":"start","scopeFiles":2}"#),
                event("measures", "2026-10-20T08:06:00.000Z", r#"{"phase":"end"}"#),
            ],
            expected: vec![size(2.0, ScopeResolver::Legacy, 0, false, None)],
        },
        Row {
            name: "no-start-measure",
            lines: vec![
                event("started", "2026-10-20T08:00:00.000Z", "{}"),
                event("done", "2026-10-20T08:01:00.000Z", "{}"),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "string-scope-files",
            lines: vec![event(
                "measures",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":"2"}"#,
            )],
            expected: Vec::new(),
        },
    ]
}

/// Every row of the "Task sizes of task streams" table, in its order.
fn rows() -> Vec<Row> {
    let mut rows = basic_rows();
    rows.extend(edge_rows());
    rows
}

/// Proves every row of the "Task sizes of task streams" table.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn task_sizes_of_task_streams() {
    for row in rows() {
        let folder = scratch("task_sizes_of_task_streams", row.name);
        write(&folder.join("tasks/1.md"), TASK_TEXT);
        write_events(&folder, "1", &row.lines);
        assert_eq!(read_task_sizes(&folder), row.expected, "{}", row.name);
    }
}

/// Proves task files without a measured stream give no size.
///
/// Covers: rust-storage/task-files-without-a-measured-stream
#[test]
fn task_files_without_a_measured_stream() {
    let folder = scratch("task_files_without_a_measured_stream", "files");
    write(&folder.join("tasks/2.md"), TASK_TEXT);
    write(&folder.join("tasks/10.md"), "not a task");
    write(&folder.join("tasks/3.md"), TASK_TEXT);
    write(&folder.join("tasks/notes.txt"), TASK_TEXT);
    write_events(&folder, "2", &first_row_lines());
    write_events(&folder, "10", &first_row_lines());
    let expected = vec![
        TaskSize {
            task: String::from("2"),
            ..size(2.0, ScopeResolver::Legacy, 1, true, Some(60_000))
        },
        TaskSize {
            task: String::from("10"),
            title: String::new(),
            acceptance_lines: 0,
            ..size(2.0, ScopeResolver::Legacy, 1, true, Some(60_000))
        },
    ];
    assert_eq!(read_task_sizes(&folder), expected);

    let empty = scratch("task_files_without_a_measured_stream", "no-tasks-folder");
    assert_eq!(read_task_sizes(&empty), Vec::<TaskSize>::new());
}

/// Proves a later end measure's hashes win and a zero scope size is a start.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn later_end_hashes_and_zero_scope_files() {
    let folder = scratch("later_end_hashes_and_zero_scope_files", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[
            event(
                "measures",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":0}"#,
            ),
            event(
                "measures",
                "2026-10-20T08:01:00.000Z",
                r#"{"phase":"end","scopeHashes":{"a":1,"b":2}}"#,
            ),
            event(
                "measures",
                "2026-10-20T08:02:00.000Z",
                r#"{"phase":"end","scopeHashes":{"a":1}}"#,
            ),
        ],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(1.0, ScopeResolver::Legacy, 0, false, Some(60_000))]
    );
}

/// Proves the start measure is the first valid one and opens the duration.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn first_valid_start_and_latest_open_start() {
    let folder = scratch("first_valid_start_and_latest_open_start", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[
            event(
                "measures",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":1}"#,
            ),
            event(
                "measures",
                "2026-10-20T08:05:00.000Z",
                r#"{"phase":"start","scopeFiles":2}"#,
            ),
            event("measures", "2026-10-20T08:06:00.000Z", r#"{"phase":"end"}"#),
        ],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(1.0, ScopeResolver::Legacy, 0, false, Some(60_000))]
    );
}

/// Proves a stream whose task file is a folder gives an empty title and 0 lines.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn stream_without_a_readable_task_file() {
    let folder = scratch("stream_without_a_readable_task_file", "row");
    fs::create_dir_all(folder.join("tasks/1.md")).expect("the task folder is made");
    write_events(&folder, "1", &first_row_lines());
    assert_eq!(
        read_task_sizes(&folder),
        vec![TaskSize {
            task: String::from("1"),
            title: String::new(),
            acceptance_lines: 0,
            scope_files: 2.0,
            resolver: ScopeResolver::Legacy,
            attempts: 1,
            first_attempt_pass: true,
            duration_ms: Some(60_000),
        }]
    );
}

/// Proves a `done` before the first `started` never passes an attempt.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn done_before_started_does_not_pass() {
    let folder = scratch("done_before_started_does_not_pass", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[
            event(
                "measures",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":2}"#,
            ),
            event("done", "2026-10-20T08:00:01.000Z", "{}"),
            event("started", "2026-10-20T08:00:02.000Z", "{}"),
        ],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(2.0, ScopeResolver::Legacy, 1, false, None)]
    );
}

/// Proves a non-measures line with a start phase is not the start measure.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn non_measures_start_is_ignored() {
    let folder = scratch("non_measures_start_is_ignored", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[
            event(
                "note",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":7}"#,
            ),
            event(
                "measures",
                "2026-10-20T08:00:01.000Z",
                r#"{"phase":"start","scopeFiles":2}"#,
            ),
        ],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(2.0, ScopeResolver::Legacy, 0, false, None)]
    );
}

/// Proves only an end measure's hashes set the scope size.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn start_hashes_are_not_end_hashes() {
    let folder = scratch("start_hashes_are_not_end_hashes", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[event(
            "measures",
            "2026-10-20T08:00:00.000Z",
            r#"{"phase":"start","scopeFiles":5,"scopeHashes":{"a":1,"b":2}}"#,
        )],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(5.0, ScopeResolver::Legacy, 0, false, None)]
    );
}

/// Proves a death before the first start leaves the first attempt passing.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn death_before_the_first_start_keeps_the_first_attempt() {
    let folder = scratch(
        "death_before_the_first_start_keeps_the_first_attempt",
        "row",
    );
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write_events(
        &folder,
        "1",
        &[
            event(
                "measures",
                "2026-10-20T08:00:00.000Z",
                r#"{"phase":"start","scopeFiles":2}"#,
            ),
            event("dead", "2026-10-20T08:00:01.000Z", "{}"),
            event("started", "2026-10-20T08:00:02.000Z", "{}"),
            event("done", "2026-10-20T08:00:03.000Z", "{}"),
        ],
    );
    assert_eq!(
        read_task_sizes(&folder),
        vec![size(2.0, ScopeResolver::Legacy, 1, true, None)]
    );
}

/// Proves equal leading numbers fall back to byte order.
///
/// Covers: rust-storage/task-sizes-of-task-streams
#[test]
fn equal_leading_numbers_sort_by_bytes() {
    let folder = scratch("equal_leading_numbers_sort_by_bytes", "row");
    write(&folder.join("tasks/1.md"), TASK_TEXT);
    write(&folder.join("tasks/01.md"), TASK_TEXT);
    write_events(&folder, "1", &first_row_lines());
    write_events(&folder, "01", &first_row_lines());
    let expected = vec![
        TaskSize {
            task: String::from("01"),
            ..size(2.0, ScopeResolver::Legacy, 1, true, Some(60_000))
        },
        TaskSize {
            task: String::from("1"),
            ..size(2.0, ScopeResolver::Legacy, 1, true, Some(60_000))
        },
    ];
    assert_eq!(read_task_sizes(&folder), expected);
}

/// Proves a notes file with a stream still gives no measured task.
///
/// Covers: rust-storage/task-files-without-a-measured-stream
#[test]
fn notes_file_with_a_stream_is_ignored() {
    let folder = scratch("notes_file_with_a_stream_is_ignored", "row");
    write(&folder.join("tasks/notes.txt"), TASK_TEXT);
    write_events(&folder, "notes", &first_row_lines());
    assert_eq!(read_task_sizes(&folder), Vec::<TaskSize>::new());
}
