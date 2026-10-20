//! Proves folding any event sequence always gives the same state.

use osq_core::{ChangeState, Event, Stream, TaskId, apply, parse_event_line};
use proptest::prelude::*;

/// One line per event type, the lines of rust-core "Every event type parses".
const LINES: &[&str] = &[
    r#"{"type":"tool","timestamp":"2026-10-17T10:00:00.000Z","data":{"tool":"bash","summary":"ls"}}"#,
    r#"{"type":"tokens","timestamp":"2026-10-17T10:00:00.000Z","data":{"promptTokens":10,"candidateTokens":2}}"#,
    r#"{"type":"text","timestamp":"2026-10-17T10:00:00.000Z","data":{"text":"hi"}}"#,
    r#"{"type":"file_changed","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":"crates/core/src/lib.rs"}}"#,
    r#"{"type":"started","timestamp":"2026-10-17T10:00:00.000Z","data":{}}"#,
    r#"{"type":"verify_ran","timestamp":"2026-10-17T10:00:00.000Z","data":{"command":"cargo test"}}"#,
    r#"{"type":"result_written","timestamp":"2026-10-17T10:00:00.000Z","data":{"path":".run/results/1.md"}}"#,
    r#"{"type":"exited","timestamp":"2026-10-17T10:00:00.000Z","data":{"exitCode":0}}"#,
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

/// The four streams an event can arrive from.
fn streams() -> [Stream; 4] {
    [
        Stream::Task(TaskId::new("1")),
        Stream::Task(TaskId::new("2")),
        Stream::Change,
        Stream::Validator,
    ]
}

/// A random sequence of at most 50 line and stream choices.
fn steps() -> impl Strategy<Value = Vec<(usize, usize)>> {
    prop::collection::vec((0..LINES.len(), 0..4usize), 0..=50)
}

/// Folds a whole sequence onto a new change state.
fn fold(events: &[(Event, Stream)]) -> ChangeState {
    let mut state = ChangeState::new(Vec::<TaskId>::new());
    for (event, stream) in events {
        state = apply(state, stream, event);
    }
    state
}

proptest! {
    /// Proves folding twice and folding in two parts both agree, and that no
    /// fold panics.
    ///
    /// Covers: rust-core/any-event-sequence-folds-the-same-way
    #[test]
    fn any_event_sequence_folds_the_same_way(steps in steps(), split in 0usize..=50) {
        let events: Vec<(Event, Stream)> = steps
            .iter()
            .map(|&(line, stream)| {
                let envelope = parse_event_line(LINES[line]).expect("the table line parses");
                (envelope.event, streams()[stream].clone())
            })
            .collect();
        let at = split.min(events.len());
        prop_assert_eq!(&fold(&events), &fold(&events));
        let mut joined = fold(&events[..at]);
        for (event, stream) in &events[at..] {
            joined = apply(joined, stream, event);
        }
        prop_assert_eq!(&fold(&events), &joined);
    }
}
