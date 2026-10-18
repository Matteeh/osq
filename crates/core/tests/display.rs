//! Proves the text of a read error, a task id and a seal.

use osq_core::{EventError, Seal, TaskId};

/// Proves each read error displays as the message of its table row.
///
/// Covers: rust-core/read-error-messages
#[test]
fn read_error_messages() {
    let cases: &[(EventError, &str)] = &[
        (EventError::NotJson, "line is not one JSON object"),
        (
            EventError::InvalidEnvelope,
            "line is not a type/timestamp/data envelope",
        ),
        (
            EventError::UnknownType {
                kind: "launched".to_owned(),
            },
            "unknown event type `launched`",
        ),
        (
            EventError::InvalidData {
                kind: "done".to_owned(),
            },
            "invalid data for event type `done`",
        ),
    ];
    for (error, message) in cases {
        assert_eq!(error.to_string(), *message, "{error:?}");
    }
}

/// Proves a task id displays as its text.
///
/// Covers: rust-core/task-id-text
#[test]
fn task_id_text() {
    assert_eq!(TaskId::new("12").to_string(), "12");
}

/// Proves a seal keeps its text and a seal error its message.
///
/// Covers: rust-core/seal-and-seal-error-text
#[test]
fn seal_and_seal_error_text() {
    let a64 = "a".repeat(64);
    let text = format!("sha256:{a64}");
    let seal = Seal::parse(&format!("{text}\n")).expect("a seal with a trailing newline");
    assert_eq!(seal.to_string(), text, "the seal's text has no newline");
    let error = Seal::parse(&format!("md5:{a64}")).expect_err("a bad prefix is refused");
    assert_eq!(
        error.to_string(),
        "not a seal: expected `sha256:` and 64 lowercase hex digits"
    );
}
