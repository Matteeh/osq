//! Proves a reason or outcome string outside its enum's set is refused.

use osq_core::{EventError, parse_event_line};

/// Asserts the line is refused as invalid data for the named event type.
fn assert_invalid(line: &str, kind: &str) {
    let error = parse_event_line(line).expect_err("the value is outside its set");
    assert_eq!(
        error,
        EventError::InvalidData {
            kind: kind.to_owned(),
        },
        "{line}"
    );
}

/// A misspelled dead reason is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn dead_with_a_misspelled_reason_is_refused() {
    assert_invalid(
        r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_failed"}}"#,
        "dead",
    );
}

/// A dead reason with surrounding whitespace is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn dead_with_a_padded_reason_is_refused() {
    assert_invalid(
        r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":" verify_red "}}"#,
        "dead",
    );
}

/// An empty dead reason is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn dead_with_an_empty_reason_is_refused() {
    assert_invalid(
        r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":""}}"#,
        "dead",
    );
}

/// A free-text retry reason is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn retry_with_a_free_text_reason_is_refused() {
    assert_invalid(
        r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"human","attempt":2}}"#,
        "retry",
    );
}

/// A misspelled regression reason is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn regressed_with_a_misspelled_reason_is_refused() {
    assert_invalid(
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"scope_changed"}}"#,
        "regressed",
    );
}

/// A baseline outcome outside its set is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn baseline_with_an_unknown_outcome_is_refused() {
    assert_invalid(
        r#"{"type":"baseline_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"green","command":"pnpm verify","commit":null,"treeDigest":null,"exitCode":0,"durationSeconds":12}}"#,
        "baseline_ran",
    );
}

/// A sync stop reason outside its set is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn sync_stopped_with_an_unknown_reason_is_refused() {
    assert_invalid(
        r#"{"type":"sync_stopped","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"dirty","message":"m","defaultBranch":"main"}}"#,
        "sync_stopped",
    );
}

/// An outcome whose spelling differs by case is refused.
///
/// Covers: rust-core/values-outside-their-set-are-refused
#[test]
fn verification_with_a_miscased_outcome_is_refused() {
    assert_invalid(
        r#"{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"Passed"}}"#,
        "verification_recorded",
    );
}
