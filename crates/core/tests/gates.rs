//! Proves the approval seal and the approve and archive gates.

use osq_core::{
    ApproveError, Approved, ArchiveError, Change, ChangeState, ChangeStatus, Seal, TaskId,
    TaskStatus,
};

/// A seal text: `sha256:` and 64 copies of `digit`.
fn seal_text(digit: char) -> String {
    format!("sha256:{}", digit.to_string().repeat(64))
}

/// A parsed seal of 64 copies of `digit`.
fn seal(digit: char) -> Seal {
    Seal::parse(&seal_text(digit)).unwrap_or_else(|error| panic!("{digit}: {error}"))
}

/// An approved change over the given task ids, sealed with `a`s.
fn approved(ids: &[&str]) -> Change<Approved> {
    Change::draft("204-rust-core", ids.iter().map(|id| TaskId::new(*id)))
        .approve(seal('a'), seal('a'))
        .expect("equal seals approve")
}

/// A change state over `ids`, one status each, and the regression flag.
fn change_state(ids: &[&str], statuses: &[TaskStatus], regressed: bool) -> ChangeState {
    let mut state = ChangeState::new(ids.iter().map(|id| TaskId::new(*id)));
    for (id, status) in ids.iter().zip(statuses) {
        let task = state
            .tasks
            .get_mut(&TaskId::new(*id))
            .expect("the state holds every id");
        task.status = *status;
    }
    state.record.regressed = regressed;
    state
}

/// Proves each seal text is a seal or an error as the table says.
///
/// Covers: rust-core/seal-texts
#[test]
fn seal_texts() {
    let a64 = "a".repeat(64);
    let valid = format!("sha256:{a64}");
    assert_eq!(
        Seal::parse(&valid).expect("64 a's").as_str(),
        valid,
        "a well-formed seal keeps its text"
    );
    let with_newline = format!("{valid}\n");
    assert_eq!(
        Seal::parse(&with_newline)
            .expect("trailing newline")
            .as_str(),
        valid,
        "the surrounding newline is trimmed"
    );
    assert!(
        Seal::parse(&seal_text('A')).is_err(),
        "uppercase hex digits are refused"
    );
    assert!(
        Seal::parse(&format!("sha256:{}", "a".repeat(63))).is_err(),
        "63 digits are refused"
    );
    assert!(
        Seal::parse(&format!("md5:{a64}")).is_err(),
        "a non-sha256 prefix is refused"
    );
    assert!(Seal::parse("").is_err(), "empty text is refused");
}

/// Proves approve passes only on equal seals and carries both on mismatch.
///
/// Covers: rust-core/approve-checks-the-seal
#[test]
fn approve_checks_the_seal() {
    let draft = || Change::draft("204-rust-core", [TaskId::new("1")]);
    let approved = draft().approve(seal('a'), seal('a')).expect("equal seals");
    assert_eq!(approved.seal(), &seal('a'), "the change holds the seal");
    assert_eq!(
        draft().approve(seal('a'), seal('b')),
        Err(ApproveError::SealMismatch {
            recorded: seal('a'),
            computed: seal('b'),
        }),
        "a mismatch carries both seals"
    );
}

/// Proves `next_task` returns the lowest pending id, or none.
///
/// Covers: rust-core/next-task-of-an-approved-change
#[test]
fn next_task_of_an_approved_change() {
    let change = approved(&["10", "2", "1"]);
    let cases: &[(bool, &[TaskStatus], Option<&str>)] = &[
        (
            false,
            &[
                TaskStatus::Pending,
                TaskStatus::Pending,
                TaskStatus::Pending,
            ],
            Some("1"),
        ),
        (
            false,
            &[TaskStatus::Pending, TaskStatus::Pending, TaskStatus::Done],
            Some("2"),
        ),
        (
            false,
            &[
                TaskStatus::Pending,
                TaskStatus::Pending,
                TaskStatus::Running,
            ],
            None,
        ),
        (
            false,
            &[TaskStatus::Pending, TaskStatus::Pending, TaskStatus::Dead],
            None,
        ),
        (
            false,
            &[TaskStatus::Done, TaskStatus::Done, TaskStatus::Done],
            None,
        ),
        (
            true,
            &[
                TaskStatus::Pending,
                TaskStatus::Pending,
                TaskStatus::Pending,
            ],
            None,
        ),
    ];
    for &(regressed, statuses, expected) in cases {
        let state = change_state(&["10", "2", "1"], statuses, regressed);
        assert_eq!(
            change.next_task(&state),
            expected.map(TaskId::new),
            "regressed {regressed}, {statuses:?}"
        );
    }
}

/// Proves archive passes only on a done change.
///
/// Covers: rust-core/archive-needs-a-done-change
#[test]
fn archive_needs_a_done_change() {
    let change = approved(&["1", "2"]);
    let done = change_state(&["1", "2"], &[TaskStatus::Done, TaskStatus::Done], false);
    assert!(change.archive(&done).is_ok(), "a done change archives");
    let pending = change_state(&["1", "2"], &[TaskStatus::Done, TaskStatus::Pending], false);
    assert_eq!(
        approved(&["1", "2"]).archive(&pending),
        Err(ArchiveError::NotDone(ChangeStatus::Pending)),
        "a pending change is not done"
    );
    let regressed = change_state(&["1", "2"], &[TaskStatus::Done, TaskStatus::Done], true);
    assert_eq!(
        approved(&["1", "2"]).archive(&regressed),
        Err(ArchiveError::NotDone(ChangeStatus::Regressed)),
        "a regressed change is not done"
    );
}
