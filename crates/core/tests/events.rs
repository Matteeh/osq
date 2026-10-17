//! Proves the typed events read and write today's event lines as they are.

use osq_core::{Event, EventError, event_line, parse_event_line};

/// Checks that a parsed event is the variant a table row names.
type VariantCheck = fn(&Event) -> bool;

/// One line per event type, with a predicate that names its variant.
const TYPE_LINES: &[(&str, VariantCheck)] = &[
    (
        r#"{"type":"tool","timestamp":"2026-10-17T10:00:00.000Z","data":{"tool":"bash","summary":"ls"}}"#,
        |event| matches!(event, Event::Tool(_)),
    ),
    (
        r#"{"type":"tokens","timestamp":"2026-10-17T10:00:00.000Z","data":{"promptTokens":10,"candidateTokens":2}}"#,
        |event| matches!(event, Event::Tokens(_)),
    ),
    (
        r#"{"type":"text","timestamp":"2026-10-17T10:00:00.000Z","data":{"text":"hi"}}"#,
        |event| matches!(event, Event::Text(_)),
    ),
    (
        r#"{"type":"file_changed","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":"crates/core/src/lib.rs"}}"#,
        |event| matches!(event, Event::FileChanged(_)),
    ),
    (
        r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
        |event| matches!(event, Event::Started(_)),
    ),
    (
        r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"cargo test"}}"#,
        |event| matches!(event, Event::VerifyRan(_)),
    ),
    (
        r#"{"type":"result_written","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":".run/results/1.md"}}"#,
        |event| matches!(event, Event::ResultWritten(_)),
    ),
    (
        r#"{"type":"exited","timestamp":"2026-10-17T10:00:00.000Z","data":{"exitCode":0}}"#,
        |event| matches!(event, Event::Exited(_)),
    ),
    (
        r#"{"type":"measures","timestamp":"2026-10-17T10:00:00.000Z","data":{"phase":"start","scopeFiles":1,"scopeLines":2,"repoFiles":3,"repoLines":4,"importFanIn":0,"proposalWords":5,"taskWords":6,"deltaRequirements":1,"deltaScenarios":2}}"#,
        |event| matches!(event, Event::Measures(_)),
    ),
    (
        r#"{"type":"dependencies_added","timestamp":"2026-10-17T10:00:00.000Z","data":{"added":[{"file":"Cargo.toml","name":"serde"}]}}"#,
        |event| matches!(event, Event::DependenciesAdded(_)),
    ),
    (
        r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
        |event| matches!(event, Event::Done(_)),
    ),
    (
        r#"{"type":"done_manual","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"by hand"}}"#,
        |event| matches!(event, Event::DoneManual(_)),
    ),
    (
        r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_failed"}}"#,
        |event| matches!(event, Event::Dead(_)),
    ),
    (
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
        |event| matches!(event, Event::Regressed(_)),
    ),
    (
        r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"human","attempt":2}}"#,
        |event| matches!(event, Event::Retry(_)),
    ),
    (
        r#"{"type":"stuck","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","fingerprint":"abc"}}"#,
        |event| matches!(event, Event::Stuck(_)),
    ),
    (
        r#"{"type":"harness_retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"phase":"start","attempt":1}}"#,
        |event| matches!(event, Event::HarnessRetry(_)),
    ),
    (
        r#"{"type":"recertification","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","outcome":"passed","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b"}}"#,
        |event| matches!(event, Event::Recertification(_)),
    ),
    (
        r#"{"type":"rejected","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"wrong idea"}}"#,
        |event| matches!(event, Event::Rejected(_)),
    ),
    (
        r#"{"type":"instructions_changed","timestamp":"2026-10-17T10:00:00.000Z","data":{"changed":["AGENTS.md"]}}"#,
        |event| matches!(event, Event::InstructionsChanged(_)),
    ),
    (
        r#"{"type":"baseline_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed","command":"pnpm verify","commit":null,"treeDigest":null,"exitCode":0,"durationSeconds":12}}"#,
        |event| matches!(event, Event::BaselineRan(_)),
    ),
    (
        r#"{"type":"focused_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"c","files":[],"scenarios":[],"outcome":"passed","exitCode":0,"duration":1,"timedOut":false,"output":""}}"#,
        |event| matches!(event, Event::FocusedRan(_)),
    ),
    (
        r#"{"type":"format_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"c","files":[],"exitCode":0,"duration":1,"timedOut":false}}"#,
        |event| matches!(event, Event::FormatRan(_)),
    ),
    (
        r#"{"type":"mutation_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"file":"a.ts","function":"f","ranges":[],"scenarios":[],"tests":[],"outcome":"measured","killed":1,"survived":0,"invalid":0,"survivors":[],"duration":3,"exitCode":null}}"#,
        |event| matches!(event, Event::MutationRan(_)),
    ),
    (
        r#"{"type":"validator_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"validated","harness":"claude","model":"m","duration":5,"exitCode":0,"scenarios":2,"findings":[],"restored":[]}}"#,
        |event| matches!(event, Event::ValidatorRan(_)),
    ),
    (
        r#"{"type":"auto_steer_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"ready","harness":"claude","model":"m","duration":5,"exitCode":null,"triggers":[],"changed":[],"restored":[]}}"#,
        |event| matches!(event, Event::AutoSteerRan(_)),
    ),
    (
        r#"{"type":"vcs_violation","timestamp":"2026-10-17T10:00:00.000Z","data":{"moved":[],"before":{"head":null,"branch":null,"index":"i","stash":[]},"after":{"head":null,"branch":null,"index":"i","stash":[]}}}"#,
        |event| matches!(event, Event::VcsViolation(_)),
    ),
    (
        r#"{"type":"scope_violation","timestamp":"2026-10-17T10:00:00.000Z","data":{"files":["src/a.ts"]}}"#,
        |event| matches!(event, Event::ScopeViolation(_)),
    ),
    (
        r#"{"type":"usage_limit","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
        |event| matches!(event, Event::UsageLimit(_)),
    ),
    (
        r#"{"type":"paused","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}}"#,
        |event| matches!(event, Event::Paused(_)),
    ),
    (
        r#"{"type":"change_verify_rerun","timestamp":"2026-10-17T10:00:00.000Z","data":{"rerun":1,"tests":[],"passed":true}}"#,
        |event| matches!(event, Event::ChangeVerifyRerun(_)),
    ),
    (
        r#"{"type":"archived","timestamp":"2026-10-17T10:00:00.000Z","data":{"archivePath":"openspec/changes/archive/204-rust-core"}}"#,
        |event| matches!(event, Event::Archived(_)),
    ),
    (
        r#"{"type":"synced","timestamp":"2026-10-17T10:00:00.000Z","data":{"defaultBranch":"main","commits":2,"duration":300}}"#,
        |event| matches!(event, Event::Synced(_)),
    ),
    (
        r#"{"type":"sync_stopped","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"dirty","message":"m","defaultBranch":"main"}}"#,
        |event| matches!(event, Event::SyncStopped(_)),
    ),
    (
        r#"{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed"}}"#,
        |event| matches!(event, Event::VerificationRecorded(_)),
    ),
];

/// Proves every event type parses to its variant and round-trips.
///
/// Covers: rust-core/every-event-type-parses
#[test]
fn every_event_type_parses() {
    for (line, is_variant) in TYPE_LINES {
        let envelope = parse_event_line(line).unwrap_or_else(|error| panic!("{line}: {error}"));
        assert_eq!(envelope.timestamp, "2026-10-17T10:00:00.000Z", "{line}");
        assert!(is_variant(&envelope.event), "wrong variant for {line}");
        let written = event_line(&envelope);
        let original: serde_json::Value =
            serde_json::from_str(line).unwrap_or_else(|error| panic!("{line}: {error}"));
        let round: serde_json::Value =
            serde_json::from_str(&written).unwrap_or_else(|error| panic!("{line}: {error}"));
        assert_eq!(round, original, "{line}");
    }
}

/// Proves an absent field stays absent, a `null` stays `null`, and a number
/// keeps its value on the way back.
///
/// Covers: rust-core/absent-null-and-numbers-stay-as-written
#[test]
fn absent_null_and_numbers_stay_as_written() {
    let lines = [
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
        r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","recordedResolver":null}}"#,
        r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{"projectCommit":null}}"#,
        r#"{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed","note":null}}"#,
        r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"pnpm verify","exitCode":0,"duration":56}}"#,
        r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"pnpm verify","exitCode":0,"duration":55.94}}"#,
        r#"{"type":"done","timestamp":"2026-10-17T10:00:00Z","data":{"task":"1"}}"#,
    ];
    for line in lines {
        let envelope = parse_event_line(line).unwrap_or_else(|error| panic!("{line}: {error}"));
        let written = event_line(&envelope);
        let original: serde_json::Value =
            serde_json::from_str(line).unwrap_or_else(|error| panic!("{line}: {error}"));
        let round: serde_json::Value =
            serde_json::from_str(&written).unwrap_or_else(|error| panic!("{line}: {error}"));
        assert_eq!(round, original, "{line}");
    }
}

/// Proves each bad line is refused with the error it deserves.
///
/// Covers: rust-core/lines-that-are-refused
#[test]
fn lines_that_are_refused() {
    let cases: [(&str, EventError); 8] = [
        ("not json", EventError::NotJson),
        ("[1,2]", EventError::NotJson),
        (
            r#"{"type":"done","data":{"task":"1"}}"#,
            EventError::InvalidEnvelope,
        ),
        (
            r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"},"extra":1}"#,
            EventError::InvalidEnvelope,
        ),
        (
            r#"{"type":"launched","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
            EventError::UnknownType {
                kind: "launched".to_owned(),
            },
        ),
        (
            r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
            EventError::InvalidData {
                kind: "done".to_owned(),
            },
        ),
        (
            r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","extra":true}}"#,
            EventError::InvalidData {
                kind: "done".to_owned(),
            },
        ),
        (
            r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":1}}"#,
            EventError::InvalidData {
                kind: "done".to_owned(),
            },
        ),
    ];
    for (line, expected) in cases {
        let error = parse_event_line(line).unwrap_err();
        assert_eq!(error, expected, "{line}");
    }
}
