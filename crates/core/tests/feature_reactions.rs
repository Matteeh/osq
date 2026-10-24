//! Proves the `Feature` reaction defaults, every event kind and `Reaction`.

use std::collections::HashSet;
use std::path::Path;

use osq_core::event::RejectedData;
use osq_core::{
    Command, Envelope, Event, EventKind, Feature, FeatureError, Invocation, Output, Reaction,
    parse_event_line,
};

/// One valid line per event type, as the event round-trip tests build them.
const TYPE_LINES: &[&str] = &[
    r#"{"type":"tool","timestamp":"2026-10-17T10:00:00.000Z","data":{"tool":"bash","summary":"ls"}}"#,
    r#"{"type":"tokens","timestamp":"2026-10-17T10:00:00.000Z","data":{"promptTokens":10,"candidateTokens":2}}"#,
    r#"{"type":"text","timestamp":"2026-10-17T10:00:00.000Z","data":{"text":"hi"}}"#,
    r#"{"type":"file_changed","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":"crates/core/src/lib.rs"}}"#,
    r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
    r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"cargo test"}}"#,
    r#"{"type":"result_written","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":".run/results/1.md"}}"#,
    r#"{"type":"exited","timestamp":"2026-10-17T10:00:00.000Z","data":{"exitCode":0}}"#,
    r#"{"type":"exit_continued","timestamp":"2026-10-17T10:00:00.000Z","data":{"exitCode":1}}"#,
    r#"{"type":"measures","timestamp":"2026-10-17T10:00:00.000Z","data":{"phase":"start","scopeFiles":1,"scopeLines":2,"repoFiles":3,"repoLines":4,"importFanIn":0,"proposalWords":5,"taskWords":6,"deltaRequirements":1,"deltaScenarios":2}}"#,
    r#"{"type":"dependencies_added","timestamp":"2026-10-17T10:00:00.000Z","data":{"added":[{"file":"Cargo.toml","name":"serde"}]}}"#,
    r#"{"type":"done","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
    r#"{"type":"done_manual","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"by hand"}}"#,
    r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_red"}}"#,
    r#"{"type":"regressed","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1"}}"#,
    r#"{"type":"retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"target":"1","reason":"verify_red","attempt":2}}"#,
    r#"{"type":"stuck","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","fingerprint":"abc"}}"#,
    r#"{"type":"harness_retry","timestamp":"2026-10-17T10:00:00.000Z","data":{"phase":"start","attempt":1}}"#,
    r#"{"type":"recertification","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","outcome":"passed","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b"}}"#,
    r#"{"type":"rejected","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"wrong idea"}}"#,
    r#"{"type":"instructions_changed","timestamp":"2026-10-17T10:00:00.000Z","data":{"changed":["AGENTS.md"]}}"#,
    r#"{"type":"baseline_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed","command":"pnpm verify","commit":null,"treeDigest":null,"exitCode":0,"durationSeconds":12}}"#,
    r#"{"type":"focused_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"c","files":[],"scenarios":[],"outcome":"passed","exitCode":0,"duration":1,"timedOut":false,"output":""}}"#,
    r#"{"type":"format_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"c","files":[],"exitCode":0,"duration":1,"timedOut":false}}"#,
    r#"{"type":"mutation_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"file":"a.ts","function":"f","ranges":[],"scenarios":[],"tests":[],"outcome":"measured","killed":1,"survived":0,"invalid":0,"survivors":[],"duration":3,"exitCode":null}}"#,
    r#"{"type":"validator_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"validated","harness":"claude","model":"m","duration":5,"exitCode":0,"scenarios":2,"findings":[],"restored":[]}}"#,
    r#"{"type":"auto_steer_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"ready","harness":"claude","model":"m","duration":5,"exitCode":null,"triggers":[],"changed":[],"restored":[]}}"#,
    r#"{"type":"vcs_violation","timestamp":"2026-10-17T10:00:00.000Z","data":{"moved":[],"before":{"head":null,"branch":null,"index":"i","stash":[]},"after":{"head":null,"branch":null,"index":"i","stash":[]}}}"#,
    r#"{"type":"scope_violation","timestamp":"2026-10-17T10:00:00.000Z","data":{"files":["src/a.ts"]}}"#,
    r#"{"type":"usage_limit","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
    r#"{"type":"paused","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","until":"2026-10-17T12:00:00.000Z","source":"harness"}}"#,
    r#"{"type":"change_verify_rerun","timestamp":"2026-10-17T10:00:00.000Z","data":{"rerun":1,"tests":[],"passed":true}}"#,
    r#"{"type":"archived","timestamp":"2026-10-17T10:00:00.000Z","data":{"archivePath":"openspec/changes/archive/204-rust-core"}}"#,
    r#"{"type":"synced","timestamp":"2026-10-17T10:00:00.000Z","data":{"defaultBranch":"main","commits":2,"duration":300}}"#,
    r#"{"type":"sync_stopped","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"sync_conflict","message":"m","defaultBranch":"main"}}"#,
    r#"{"type":"verification_recorded","timestamp":"2026-10-17T10:00:00.000Z","data":{"outcome":"passed"}}"#,
];

/// A feature that implements only the three required methods.
struct Silent;

impl Feature for Silent {
    fn name(&self) -> &'static str {
        "silent"
    }

    fn commands(&self) -> Vec<Command> {
        Vec::new()
    }

    fn run(&self, _invocation: &Invocation) -> Result<Output, FeatureError> {
        Ok(Output::text(""))
    }
}

/// Builds a `rejected` envelope at the timestamp the event lines use.
fn rejected_envelope() -> Envelope {
    Envelope {
        timestamp: "2026-10-17T10:00:00.000Z".to_owned(),
        event: Event::Rejected(RejectedData {
            reason: "wrong idea".to_owned(),
        }),
    }
}

/// Parses one line from the table, or panics naming the line.
fn parse(line: &str) -> Envelope {
    parse_event_line(line).unwrap_or_else(|error| panic!("{line}: {error}"))
}

/// Proves the trait's reaction defaults change no feature.
///
/// Covers: rust-core/reaction-defaults
#[test]
fn reaction_defaults() {
    let feature = Silent;
    assert_eq!(feature.reacts_to(), Vec::new());

    let root = Path::new("/p");
    let change = Path::new("/p/openspec/changes/001-a");
    let envelope = rejected_envelope();
    let reaction = Reaction::new(root, change, &envelope);
    assert_eq!(
        feature
            .react(&reaction)
            .expect("the default reaction succeeds"),
        Output::text("")
    );
}

/// Proves every row of "Kinds of events".
///
/// Covers: rust-core/kinds-of-events
#[test]
fn kinds_of_events() {
    let cases: [(&str, EventKind, &str); 4] = [
        (
            r#"{"type":"rejected","timestamp":"2026-10-17T10:00:00.000Z","data":{"reason":"wrong idea"}}"#,
            EventKind::Rejected,
            "rejected",
        ),
        (
            r#"{"type":"dead","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","reason":"verify_red"}}"#,
            EventKind::Dead,
            "dead",
        ),
        (
            r#"{"type":"recertification","timestamp":"2026-10-17T10:00:00.000Z","data":{"task":"1","outcome":"passed","differingPaths":[],"attribution":[],"command":"cargo test","exitCode":0,"output":"","timedOut":false,"recordedHash":"a","currentHash":"b"}}"#,
            EventKind::Recertification,
            "recertification",
        ),
        (
            r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"cargo test"}}"#,
            EventKind::VerifyRan,
            "verify_ran",
        ),
    ];
    for (line, kind, name) in cases {
        let envelope = parse(line);
        assert_eq!(envelope.event.kind(), kind, "{line}");
        assert_eq!(kind.name(), name, "{line}");
    }
}

/// Proves every event kind names its type and that no two kinds are equal.
///
/// Covers: rust-core/every-kind-names-its-type
#[test]
fn every_kind_names_its_type() {
    let mut kinds = HashSet::new();
    for line in TYPE_LINES {
        let envelope = parse(line);
        let kind = envelope.event.kind();
        let original: serde_json::Value =
            serde_json::from_str(line).unwrap_or_else(|error| panic!("{line}: {error}"));
        let expected = original["type"]
            .as_str()
            .unwrap_or_else(|| panic!("{line}: line has no type"));
        assert_eq!(kind.name(), expected, "{line}");
        kinds.insert(kind);
    }
    assert_eq!(kinds.len(), TYPE_LINES.len(), "every kind is different");
}

/// Proves `Reaction::new` keeps its root, change and envelope.
///
/// Covers: rust-core/reaction-fields
#[test]
fn reaction_fields() {
    let root = Path::new("/p");
    let change = Path::new("/p/openspec/changes/001-a");
    let envelope = rejected_envelope();

    let reaction = Reaction::new(root, change, &envelope);

    assert_eq!(reaction.root, root);
    assert_eq!(reaction.change, change);
    assert_eq!(reaction.envelope, &envelope);
}
