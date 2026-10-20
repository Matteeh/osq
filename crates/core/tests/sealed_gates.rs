//! Proves the computed seal and the folded state read back.

use osq_core::{
    ChangeState, Event, Seal, Stream, TaskId, TaskStatus, apply, compute_seal, parse_event_line,
};

/// The seal `hashChangeFolder` gives for `proposal.md`: `a\n`.
const SEAL_TEXT: &str = "sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd";

/// Parses one event line into its typed event.
fn event(line: &str) -> Event {
    parse_event_line(line)
        .unwrap_or_else(|error| panic!("{line}: {error}"))
        .event
}

/// Covers: rust-core/computed-seal-reads-back
#[test]
fn computed_seal_reads_back() {
    let computed = compute_seal(&[("proposal.md", b"a\n")]);
    assert_eq!(computed.as_str(), SEAL_TEXT, "as_str gives the seal's text");
    assert_eq!(
        computed.seal(),
        Seal::parse(SEAL_TEXT).expect("the text is a seal"),
        "seal gives the seal"
    );
}

/// Covers: rust-core/folded-state-reads-back
#[test]
fn folded_state_reads_back() {
    let mut state = ChangeState::new([TaskId::new("1")]);
    state = apply(
        state,
        &Stream::Task(TaskId::new("1")),
        &event(r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"attempt":1}}"#),
    );
    state = apply(
        state,
        &Stream::Change,
        &event(
            r#"{"type":"archived","timestamp":"2026-10-17T10:00:00.000Z","data":{"archivePath":"openspec/changes/archive/204-rust-core"}}"#,
        ),
    );
    assert_eq!(
        state.tasks().keys().map(TaskId::as_str).collect::<Vec<_>>(),
        ["1"],
        "tasks() holds only task 1"
    );
    let task = &state.tasks()[&TaskId::new("1")];
    assert_eq!(task.status, TaskStatus::Running, "task 1 is running");
    assert_eq!(task.attempt, 1, "task 1 is on attempt 1");
    let record = state.record();
    assert_eq!(
        record.archived.as_deref(),
        Some("openspec/changes/archive/204-rust-core"),
        "record() is archived at the path"
    );
    assert!(!record.regressed, "the record is not regressed");
    assert!(record.rejected.is_none(), "the record is not rejected");
}
