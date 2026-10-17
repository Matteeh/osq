//! Proves the folds follow the task, change and status tables.

use osq_core::{
    ChangeRecord, ChangeState, ChangeStatus, Event, Stream, TaskId, TaskState, TaskStatus, apply,
    apply_change, apply_task, change_status, parse_event_line,
};

/// A task state written as status, attempt, reason and pause-until.
type TaskSpec = (TaskStatus, u64, Option<&'static str>, Option<&'static str>);

/// One row of the task transition table: before, event line and after.
type TaskCase = (TaskSpec, &'static str, TaskSpec);

/// A change record written as regressed, archive path and rejection reason.
type RecordSpec = (bool, Option<&'static str>, Option<&'static str>);

/// One row of the change transition table: event line and record after.
type ChangeCase = (&'static str, RecordSpec);

/// One row of the status table: approved, record, task statuses and status.
type StatusCase = (bool, RecordSpec, &'static [TaskStatus], ChangeStatus);

/// Parses one event line into its typed event.
fn event(line: &str) -> Event {
    parse_event_line(line)
        .unwrap_or_else(|error| panic!("{line}: {error}"))
        .event
}

/// Builds a task state from its spec.
fn task(spec: TaskSpec) -> TaskState {
    let (status, attempt, reason, paused_until) = spec;
    TaskState {
        status,
        attempt,
        reason: reason.map(ToOwned::to_owned),
        paused_until: paused_until.map(ToOwned::to_owned),
    }
}

/// Builds a change record from its spec.
fn record(spec: RecordSpec) -> ChangeRecord {
    ChangeRecord {
        regressed: spec.0,
        archived: spec.1.map(ToOwned::to_owned),
        rejected: spec.2.map(ToOwned::to_owned),
    }
}

/// Builds a change state with one task per given status.
fn change_state(spec: RecordSpec, statuses: &[TaskStatus]) -> ChangeState {
    let mut state =
        ChangeState::new((0..statuses.len()).map(|index| TaskId::new(index.to_string())));
    for (index, status) in statuses.iter().enumerate() {
        state.tasks.insert(
            TaskId::new(index.to_string()),
            TaskState {
                status: *status,
                ..TaskState::new()
            },
        );
    }
    state.record = record(spec);
    state
}

/// The task transition table, one line per row.
const TASK_CASES: &[TaskCase] = &[
    (
        (TaskStatus::Pending, 0, None, None),
        r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":1}}"#,
        (TaskStatus::Running, 1, None, None),
    ),
    (
        (TaskStatus::Pending, 1, None, None),
        r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
        (TaskStatus::Running, 2, None, None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"exited","timestamp":"2026-10-17T10:00:00.000Z","data":{"exitCode":0}}"#,
        (TaskStatus::Running, 1, None, None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"tool","timestamp":"2026-10-17T10:00:00.000Z","data":{"tool":"bash","summary":"ls"}}"#,
        (TaskStatus::Running, 1, None, None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
        (TaskStatus::Done, 1, None, None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"done_manual","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"by hand"}}"#,
        (TaskStatus::Done, 1, None, None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_failed"}}"#,
        (TaskStatus::Dead, 1, Some("verify_failed"), None),
    ),
    (
        (TaskStatus::Dead, 1, Some("verify_failed"), None),
        r#"{"type":"stuck","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","fingerprint":"abc"}}"#,
        (TaskStatus::Dead, 1, Some("verify_failed"), None),
    ),
    (
        (TaskStatus::Dead, 1, Some("verify_failed"), None),
        r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"human","attempt":2}}"#,
        (TaskStatus::Pending, 1, Some("human"), None),
    ),
    (
        (TaskStatus::Done, 1, None, None),
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"scope_changed"}}"#,
        (TaskStatus::Regressed, 1, Some("scope_changed"), None),
    ),
    (
        (TaskStatus::Regressed, 1, Some("scope_changed"), None),
        r#"{"type":"recertification","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","outcome":"passed","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b"}}"#,
        (TaskStatus::Done, 1, None, None),
    ),
    (
        (TaskStatus::Regressed, 1, Some("scope_changed"), None),
        r#"{"type":"recertification","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","outcome":"requeued","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b","reason":"verify_failed"}}"#,
        (TaskStatus::Pending, 1, Some("verify_failed"), None),
    ),
    (
        (TaskStatus::Running, 1, None, None),
        r#"{"type":"paused","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}}"#,
        (
            TaskStatus::Pending,
            1,
            None,
            Some("2026-10-17T12:00:00.000Z"),
        ),
    ),
    (
        (
            TaskStatus::Pending,
            1,
            None,
            Some("2026-10-17T12:00:00.000Z"),
        ),
        r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":2}}"#,
        (TaskStatus::Running, 2, None, None),
    ),
];

/// The change transition table, one line per row.
const CHANGE_CASES: &[ChangeCase] = &[
    (
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"change","reason":"land_conflict"}}"#,
        (true, None, None),
    ),
    (
        r#"{"type":"archived","timestamp":"2026-10-17T10:00:00.000Z","data":{"archivePath":"openspec/changes/archive/204-rust-core"}}"#,
        (false, Some("openspec/changes/archive/204-rust-core"), None),
    ),
    (
        r#"{"type":"rejected","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"wrong idea"}}"#,
        (false, None, Some("wrong idea")),
    ),
    (
        r#"{"type":"synced","timestamp":"2026-10-17T10:00:00.000Z","data":{"defaultBranch":"main","commits":2,"duration":300}}"#,
        (false, None, None),
    ),
    (
        r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"cargo test"}}"#,
        (false, None, None),
    ),
];

/// The status table, one row per rule.
const STATUS_CASES: &[StatusCase] = &[
    (
        false,
        (false, None, None),
        &[TaskStatus::Pending],
        ChangeStatus::Unapproved,
    ),
    (
        false,
        (false, None, Some("wrong idea")),
        &[TaskStatus::Pending],
        ChangeStatus::Rejected,
    ),
    (
        true,
        (false, Some("openspec/changes/archive/204-rust-core"), None),
        &[TaskStatus::Done, TaskStatus::Done],
        ChangeStatus::Archived,
    ),
    (
        true,
        (true, None, None),
        &[TaskStatus::Done],
        ChangeStatus::Regressed,
    ),
    (
        true,
        (false, None, None),
        &[TaskStatus::Done, TaskStatus::Regressed],
        ChangeStatus::Regressed,
    ),
    (
        true,
        (false, None, None),
        &[TaskStatus::Dead, TaskStatus::Running],
        ChangeStatus::Dead,
    ),
    (
        true,
        (false, None, None),
        &[TaskStatus::Running, TaskStatus::Pending],
        ChangeStatus::Running,
    ),
    (
        true,
        (false, None, None),
        &[TaskStatus::Done, TaskStatus::Done],
        ChangeStatus::Done,
    ),
    (true, (false, None, None), &[], ChangeStatus::Done),
    (
        true,
        (false, None, None),
        &[TaskStatus::Done, TaskStatus::Pending],
        ChangeStatus::Pending,
    ),
];

/// Proves each file name reads as the stream it holds.
///
/// Covers: rust-core/file-names-and-task-order
#[test]
fn file_names_and_task_order() {
    let cases: &[(&str, Option<Stream>)] = &[
        ("1.jsonl", Some(Stream::Task(TaskId::new("1")))),
        ("12.jsonl", Some(Stream::Task(TaskId::new("12")))),
        ("change.jsonl", Some(Stream::Change)),
        ("validator.jsonl", Some(Stream::Validator)),
        ("notes.txt", None),
        (".jsonl", None),
    ];
    for (name, expected) in cases {
        assert_eq!(&Stream::from_file_name(name), expected, "{name}");
    }
}

/// Proves task ids sort by their number, so `10` follows `2`.
///
/// Covers: rust-core/task-ids-sort-by-number
#[test]
fn task_ids_sort_by_number() {
    let mut ids = [TaskId::new("10"), TaskId::new("2"), TaskId::new("1")];
    ids.sort();
    assert_eq!(
        ids.iter().map(TaskId::as_str).collect::<Vec<_>>(),
        ["1", "2", "10"]
    );
}

/// Proves every task transition row lands on the state it names.
///
/// Covers: rust-core/task-transitions
#[test]
fn task_transitions() {
    for &(before, line, after) in TASK_CASES {
        assert_eq!(
            apply_task(task(before), &event(line)),
            task(after),
            "{line}"
        );
    }
}

/// Proves every change transition row lands on the record it names.
///
/// Covers: rust-core/change-transitions
#[test]
fn change_transitions() {
    for &(line, after) in CHANGE_CASES {
        let next = apply_change(ChangeRecord::new(), &event(line));
        assert_eq!(next, record(after), "{line}");
    }
}

/// Proves a change retry clears the change's regression.
///
/// Covers: rust-core/retry-clears-a-change-regression
#[test]
fn retry_clears_a_change_regression() {
    let regressed = apply_change(
        ChangeRecord::new(),
        &event(
            r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"change","reason":"land_conflict"}}"#,
        ),
    );
    assert!(regressed.regressed, "the change starts regressed");
    let retried = apply_change(
        regressed,
        &event(
            r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"change","reason":"human","attempt":1}}"#,
        ),
    );
    assert!(!retried.regressed, "the retry clears the regression");
}

/// Proves an event only changes the state of the stream it came from.
///
/// Covers: rust-core/events-reach-their-streams-state
#[test]
fn events_reach_their_streams_state() {
    let mut state = ChangeState::new([TaskId::new("1"), TaskId::new("2")]);
    state = apply(
        state,
        &Stream::Task(TaskId::new("2")),
        &event(r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":1}}"#),
    );
    state = apply(
        state,
        &Stream::Change,
        &event(
            r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"change"}}"#,
        ),
    );
    state = apply(
        state,
        &Stream::Validator,
        &event(
            r#"{"type":"validator_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"validated","harness":"claude","model":"m","duration":5,"exitCode":0,"scenarios":2,"findings":[],"restored":[]}}"#,
        ),
    );
    assert_eq!(state.tasks[&TaskId::new("1")].status, TaskStatus::Pending);
    let task2 = &state.tasks[&TaskId::new("2")];
    assert_eq!(task2.status, TaskStatus::Running);
    assert_eq!(task2.attempt, 1);
    assert!(state.record.regressed, "the change stream's event landed");
}

/// Proves a task stream the state lacks adds its task.
///
/// Covers: rust-core/an-unknown-task-stream-adds-its-task
#[test]
fn an_unknown_task_stream_adds_its_task() {
    let state = apply(
        ChangeState::new([TaskId::new("1")]),
        &Stream::Task(TaskId::new("3")),
        &event(r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":1}}"#),
    );
    assert_eq!(
        state.tasks.keys().map(TaskId::as_str).collect::<Vec<_>>(),
        ["1", "3"]
    );
    let task3 = &state.tasks[&TaskId::new("3")];
    assert_eq!(task3.status, TaskStatus::Running);
    assert_eq!(task3.attempt, 1);
}

/// Proves the status order, the first rule that holds.
///
/// Covers: rust-core/status-of-a-change
#[test]
fn status_of_a_change() {
    for &(approved, spec, statuses, expected) in STATUS_CASES {
        let state = change_state(spec, statuses);
        assert_eq!(change_status(approved, &state), expected, "{spec:?}");
    }
}
