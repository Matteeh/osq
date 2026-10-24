//! Proves retry clears a delivered approval's steering triggers exactly once.

mod support;

#[path = "../src/retry/time.rs"]
mod source_time;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::event::{ApprovedData, Event, FailureReason, RejectedData, RetryData};
use osq_core::{Envelope, EventKind, Feature, Reaction, event_line, parse_event_line};
use osq_feature_retry::RetryFeature;
use osq_kernel_storage::change_folder_seal;
use support::{change_folder, copy_tree, failed_message, run, scratch, tree, write};

/// A scratch project holding the approved change every reaction test uses.
struct Project {
    /// The scratch project root.
    root: PathBuf,
    /// The change folder `001-a`.
    change: PathBuf,
}

/// Builds an approved `001-a` with two tasks, a dead task and a red change.
fn project(name: &str) -> Project {
    let root = scratch("retry_reaction", name);
    let change = change_folder(&root, "001-a");
    write(&change, "proposal.md", "# 001 a\n");
    write(
        &change,
        "tasks/1.md",
        "---\ntitle: One\nverify: true\n---\n",
    );
    write(
        &change,
        "tasks/2.md",
        "---\ntitle: Two\nverify: true\n---\n",
    );
    write(
        &change,
        ".run/dead/1.md",
        "---\nreason: blocked\n---\nneeds a port\n",
    );
    write(
        &change,
        ".run/regressed/change.md",
        "---\nreason: verify_red\n---\nred\n",
    );
    seal(&change);
    Project { root, change }
}

/// Writes the folder's current seal to `.run/approved`.
fn seal(change: &Path) {
    let seal = change_folder_seal(change).expect("the change folder seals");
    write(change, ".run/approved", format!("{}\n", seal.as_str()));
}

/// An `approved` event for the given targets at the given timestamp.
fn approved(targets: &[&str], timestamp: &str) -> Envelope {
    Envelope {
        timestamp: timestamp.to_owned(),
        event: Event::Approved(ApprovedData {
            hash: "sha256:sealed".to_owned(),
            targets: targets.iter().map(|target| (*target).to_owned()).collect(),
        }),
    }
}

/// The current time in the form both osq writers use.
fn now() -> String {
    source_time::format_utc(source_time::now_ms())
}

/// Runs the feature's reaction for one event on a project's change.
fn react(project: &Project, envelope: &Envelope) -> Result<(), osq_core::FeatureError> {
    RetryFeature
        .react(&Reaction::new(&project.root, &project.change, envelope))
        .map(|_| ())
}

/// The change folder's `.run/` files, keyed relative to the change folder.
fn run_files(change: &Path) -> Vec<String> {
    tree(change)
        .into_keys()
        .filter(|path| path.starts_with(".run/"))
        .collect()
}

/// One line of a target's event stream, parsed.
fn event_lines(change: &Path, target: &str) -> Vec<Envelope> {
    fs::read_to_string(
        change
            .join(".run")
            .join("events")
            .join(format!("{target}.jsonl")),
    )
    .expect("the event file reads")
    .lines()
    .filter_map(|line| parse_event_line(line).ok())
    .collect()
}

/// The retry payloads a target's event stream holds.
fn retries(change: &Path, target: &str) -> Vec<RetryData> {
    event_lines(change, target)
        .into_iter()
        .filter_map(|envelope| match envelope.event {
            Event::Retry(data) => Some(data),
            _ => None,
        })
        .collect()
}

/// Proves the retry feature reacts to `approved` alone.
///
/// Covers: rust-retry/retry-reacts-to-approvals
#[test]
fn retry_reacts_to_approvals() {
    assert_eq!(RetryFeature.reacts_to(), vec![EventKind::Approved]);
}

/// Proves every target row of the reaction's trigger retirement.
///
/// Covers: rust-retry/approval-reaction-retires-triggers
#[test]
fn approval_reaction_retires_triggers() {
    let rows: [(&str, &[&str], &[&str]); 4] = [
        (
            "task",
            &["1"],
            &[
                ".run/approved",
                ".run/dead/1.1.md",
                ".run/events/1.jsonl",
                ".run/regressed/change.md",
            ],
        ),
        (
            "change-and-task",
            &["change", "1"],
            &[
                ".run/approved",
                ".run/dead/1.1.md",
                ".run/events/1.jsonl",
                ".run/events/change.jsonl",
                ".run/regressed/change.1.md",
            ],
        ),
        (
            "no-marker",
            &["2"],
            &[
                ".run/approved",
                ".run/dead/1.md",
                ".run/regressed/change.md",
            ],
        ),
        (
            "no-target",
            &[],
            &[
                ".run/approved",
                ".run/dead/1.md",
                ".run/regressed/change.md",
            ],
        ),
    ];
    for (name, targets, files) in rows {
        let project = project(&format!("retires-{name}"));
        let envelope = approved(targets, &now());
        react(&project, &envelope).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(run_files(&project.change), files, "{name}: files");
        match name {
            "task" => {
                let retries = retries(&project.change, "1");
                assert_eq!(retries.len(), 1, "task: one retry");
                assert_eq!(retries[0].attempt, 2, "task: attempt");
                assert_eq!(retries[0].reason, FailureReason::Blocked, "task: reason");
            }
            "change-and-task" => {
                for (target, reason) in [
                    ("1", FailureReason::Blocked),
                    ("change", FailureReason::VerifyRed),
                ] {
                    let retries = retries(&project.change, target);
                    assert_eq!(retries.len(), 1, "{target}: one retry");
                    assert_eq!(retries[0].attempt, 2, "{target}: attempt");
                    assert_eq!(retries[0].reason, reason, "{target}: reason");
                }
            }
            _ => {}
        }
        let before = tree(&project.change);
        react(&project, &envelope).expect("the second delivery is passed over");
        assert_eq!(tree(&project.change), before, "{name}: second delivery");
    }
}

/// Proves a retry a failure comes after is kept, not retired again.
///
/// Covers: rust-retry/later-failures-are-kept
#[test]
fn later_failures_are_kept() {
    let project = project("later-failures");
    let envelope = approved(&["1"], &now());
    react(&project, &envelope).expect("the first delivery retires task 1");
    write(
        &project.change,
        ".run/dead/1.md",
        "---\nreason: verify_red\n---\nlater\n",
    );
    let before = tree(&project.change);
    react(&project, &envelope).expect("the second delivery is passed over");
    assert_eq!(tree(&project.change), before, "the later failure is kept");
}

/// Proves a retry at the event's own timestamp is not retired again.
///
/// Covers: rust-retry/later-failures-are-kept
#[test]
fn retry_at_the_event_time_is_kept() {
    let project = project("retry-equal");
    let timestamp = "2026-10-01T10:00:00.000Z";
    write(
        &project.change,
        ".run/events/1.jsonl",
        format!(
            "{}\n",
            event_line(&Envelope {
                timestamp: timestamp.to_owned(),
                event: Event::Retry(RetryData {
                    target: "1".to_owned(),
                    reason: FailureReason::Blocked,
                    attempt: 2,
                    automatic: None,
                }),
            })
        ),
    );
    let before = tree(&project.change);
    react(&project, &approved(&["1"], timestamp)).expect("the equal retry is kept");
    assert_eq!(
        tree(&project.change),
        before,
        "the marker and stream are kept"
    );
}

/// Proves only a matching retry at or after the event retires a target.
///
/// Covers: rust-retry/later-failures-are-kept
#[test]
fn older_or_other_retries_are_ignored() {
    let project = project("retry-before");
    let timestamp = "2026-10-01T10:00:00.000Z";
    let lines = [
        "not json".to_owned(),
        event_line(&Envelope {
            timestamp: "2026-10-02T10:00:00.000Z".to_owned(),
            event: Event::Rejected(RejectedData {
                reason: "no".to_owned(),
            }),
        }),
        event_line(&Envelope {
            timestamp: "2026-10-02T10:00:00.000Z".to_owned(),
            event: Event::Retry(RetryData {
                target: "2".to_owned(),
                reason: FailureReason::Blocked,
                attempt: 2,
                automatic: None,
            }),
        }),
        event_line(&Envelope {
            timestamp: "2026-09-30T10:00:00.000Z".to_owned(),
            event: Event::Retry(RetryData {
                target: "1".to_owned(),
                reason: FailureReason::Blocked,
                attempt: 2,
                automatic: None,
            }),
        }),
    ];
    write(
        &project.change,
        ".run/events/1.jsonl",
        format!("{}\n", lines.join("\n")),
    );
    react(&project, &approved(&["1"], timestamp)).expect("the older retry is ignored");
    assert!(
        project.change.join(".run/dead/1.1.md").is_file(),
        "the task's dead marker is retired"
    );
    let found = retries(&project.change, "1");
    assert_eq!(
        found.len(),
        3,
        "the other target, the older retry and the new one"
    );
    let last = found.last().expect("the new retry is last");
    assert_eq!(last.target, "1", "the new retry's target");
    assert_eq!(last.attempt, 2, "the new retry's attempt");
}

/// Proves every refusal row: the first refused target fails the reaction and
/// leaves the targets before it retired.
///
/// Covers: rust-retry/approval-reaction-refusals
#[test]
fn approval_reaction_refusals() {
    let running = project("refusal-running");
    write(
        &running.change,
        ".run/running/2.pid",
        "{\"pid\":999999,\"startedAt\":0}\n",
    );
    let copy = copy_of(&running, "refusal-running-copy");
    let expected = run(&copy, ["1", "change"]).expect_err("retry refuses the running change");
    let error = react(&running, &approved(&["1", "change"], &now()))
        .expect_err("the reaction refuses the running change");
    assert_eq!(
        failed_message(error),
        failed_message(expected),
        "the running refusal equals retry's"
    );
    let files = run_files(&running.change);
    assert!(
        files.contains(&".run/dead/1.1.md".to_owned()),
        "task 1 retired"
    );
    assert!(
        files.contains(&".run/events/1.jsonl".to_owned()),
        "task 1 event"
    );
    assert!(
        files.contains(&".run/regressed/change.md".to_owned()),
        "change kept"
    );
    assert!(
        !files.contains(&".run/events/change.jsonl".to_owned()),
        "the refused change wrote no event"
    );

    let stale = project("refusal-stale");
    let tasks = stale.change.join("tasks/1.md");
    let mut text = fs::read_to_string(&tasks).expect("the task reads");
    text.push_str("\nAn unapproved edit.\n");
    fs::write(&tasks, text).expect("the task edit is written");
    let copy = copy_of(&stale, "refusal-stale-copy");
    let expected = run(&copy, ["1", "1"]).expect_err("retry refuses the stale approval");
    let error = react(&stale, &approved(&["1"], &now()))
        .expect_err("the reaction refuses the stale approval");
    assert_eq!(
        failed_message(error),
        failed_message(expected),
        "the stale refusal equals retry's"
    );
    let files = run_files(&stale.change);
    assert_eq!(
        files,
        [
            ".run/approved",
            ".run/dead/1.md",
            ".run/regressed/change.md"
        ],
        "the refused target wrote nothing"
    );
}

/// Copies a project root so a retry command can prove the same refusal.
fn copy_of(project: &Project, name: &str) -> PathBuf {
    let copy = scratch("retry_reaction", name);
    copy_tree(&project.root, &copy);
    copy
}

/// Proves an event of another kind writes nothing.
///
/// Covers: rust-retry/other-events-are-passed-over
#[test]
fn other_events_are_passed_over() {
    let project = project("other-event");
    let envelope = Envelope {
        timestamp: now(),
        event: Event::Rejected(RejectedData {
            reason: "no".to_owned(),
        }),
    };
    let before = tree(&project.change);
    let output = RetryFeature
        .react(&Reaction::new(&project.root, &project.change, &envelope))
        .expect("the rejected event is passed over");
    assert_eq!(output.text, "", "the reaction prints nothing");
    assert_eq!(tree(&project.change), before, "every file is unchanged");
}
