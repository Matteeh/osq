//! Proves the edges of task id order and the folds' guards.

use osq_core::event::FailureReason;
use osq_core::{
    Change, ChangeRecord, ChangeState, ComputedSeal, Event, Stream, TaskId, TaskState, TaskStatus,
    apply, apply_change, apply_task, compute_seal, parse_event_line,
};

/// Parses one event line into its typed event.
fn event(line: &str) -> Event {
    parse_event_line(line)
        .unwrap_or_else(|error| panic!("{line}: {error}"))
        .event
}

/// The computed seal of the one entry `proposal.md`: `a\n`.
fn computed() -> ComputedSeal {
    compute_seal(&[("proposal.md", b"a\n")])
}

/// A `Regressed` task at attempt 1 with the given reason.
fn regressed(reason: FailureReason) -> TaskState {
    TaskState {
        status: TaskStatus::Regressed,
        attempt: 1,
        reason: Some(reason),
        paused_until: None,
    }
}

/// The text of each task id, for comparison with a table row.
fn task_ids(ids: &[TaskId]) -> Vec<&str> {
    ids.iter().map(TaskId::as_str).collect()
}

/// Proves ids with one leading number sort by their text, `2a` before `2b`.
///
/// Covers: rust-core/task-ids-with-one-number-sort-by-text
#[test]
fn task_ids_with_one_number_sort_by_text() {
    let mut ids = [
        TaskId::new("2b"),
        TaskId::new("10"),
        TaskId::new("2a"),
        TaskId::new("1"),
    ];
    ids.sort();
    assert_eq!(
        ids.iter().map(TaskId::as_str).collect::<Vec<_>>(),
        ["1", "2a", "2b", "10"],
        "2b, 10, 2a, 1 sorted"
    );
}

/// Proves `done` and `done_manual` clear a reason the task already had.
///
/// Covers: rust-core/done-clears-an-earlier-reason
#[test]
fn done_clears_an_earlier_reason() {
    let done = TaskState {
        status: TaskStatus::Done,
        attempt: 1,
        reason: None,
        paused_until: None,
    };
    let cases: &[&str] = &[
        r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
        r#"{"type":"done_manual","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"by hand"}}"#,
    ];
    for line in cases {
        assert_eq!(
            apply_task(regressed(FailureReason::ScopeRegression), &event(line)),
            done,
            "{line}"
        );
    }
}

/// Proves a task-level regression and retry leave the change record alone.
///
/// Covers: rust-core/task-regressions-and-retries-leave-the-change-record
#[test]
fn task_regressions_and_retries_leave_the_change_record() {
    let regressed_record = apply_change(
        ChangeRecord::new(),
        &event(
            r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"change","reason":"sync_conflict"}}"#,
        ),
    );
    let cases: &[(ChangeRecord, &str, bool)] = &[
        (
            ChangeRecord::new(),
            r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"scope_regression"}}"#,
            false,
        ),
        (
            regressed_record,
            r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"verify_red","attempt":2}}"#,
            true,
        ),
    ];
    for (before, line, regressed) in cases {
        assert_eq!(
            apply_change(before.clone(), &event(line)).regressed,
            *regressed,
            "{line}"
        );
    }
}

/// Proves a change gives back its id and tasks in every state.
///
/// Covers: rust-core/a-change-keeps-its-id-and-tasks
#[test]
fn a_change_keeps_its_id_and_tasks() {
    let draft = Change::draft("204-rust-core", [TaskId::new("1"), TaskId::new("2")]);
    assert_eq!(draft.id(), "204-rust-core", "the draft keeps its id");
    assert_eq!(
        task_ids(draft.tasks()),
        ["1", "2"],
        "the draft keeps its tasks"
    );

    let computed = computed();
    let approved = draft
        .approve(computed.clone().seal(), computed)
        .expect("equal seals approve");
    assert_eq!(approved.id(), "204-rust-core", "the approved keeps its id");
    assert_eq!(
        task_ids(approved.tasks()),
        ["1", "2"],
        "the approved keeps its tasks"
    );

    let mut state = ChangeState::new([TaskId::new("1"), TaskId::new("2")]);
    for id in ["1", "2"] {
        state = apply(
            state,
            &Stream::Task(TaskId::new(id)),
            &event(r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#),
        );
    }
    let archived = approved.archive(&state).expect("a done change archives");
    assert_eq!(archived.id(), "204-rust-core", "the archived keeps its id");
    assert_eq!(
        task_ids(archived.tasks()),
        ["1", "2"],
        "the archived keeps its tasks"
    );
}
