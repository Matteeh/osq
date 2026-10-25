//! Proves retry keeps a failure its target's stream records after the approval.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::event::{DeadData, DeadReason, Event, RegressedData, RegressionReason, RetryData};
use osq_core::{Envelope, Feature, Reaction, event_line, parse_event_line};
use osq_feature_retry::RetryFeature;
use osq_kernel_storage::change_folder_seal;
use support::{change_folder, scratch, write};

/// The approved event's timestamp, one second before every appended line.
const APPROVED_AT: &str = "2026-10-01T10:00:00.000Z";

/// The appended failure lines' timestamp, one second after the event.
const LATER_AT: &str = "2026-10-01T10:00:01.000Z";

/// The failure a row appends to its target's stream.
#[derive(Clone, Copy)]
enum Later {
    /// A change regression with the reason `sync_conflict`.
    RegressedChange,
    /// A blocked task death.
    DeadTask,
    /// A task regression.
    RegressedTask,
}

impl Later {
    /// The stream this failure is appended to.
    fn stream(self) -> &'static str {
        match self {
            Self::RegressedChange => "change",
            Self::DeadTask | Self::RegressedTask => "1",
        }
    }

    /// The event this failure appends.
    fn event(self) -> Event {
        match self {
            Self::RegressedChange => {
                regressed(Some("change"), Some(RegressionReason::SyncConflict))
            }
            Self::DeadTask => Event::Dead(DeadData {
                task: "1".to_owned(),
                reason: DeadReason::Blocked,
            }),
            Self::RegressedTask => regressed(Some("1"), None),
        }
    }
}

/// A `regressed` event with the row's task and reason.
fn regressed(task: Option<&str>, reason: Option<RegressionReason>) -> Event {
    Event::Regressed(RegressedData {
        task: task.map(str::to_owned),
        exit_code: None,
        duration: None,
        command: None,
        differing_paths: None,
        missing_paths: None,
        reason,
        attribution: None,
        recorded_hash: None,
        current_hash: None,
        recorded_resolver: None,
        current_resolver: None,
        output: None,
        timed_out: None,
        verification_passed: None,
    })
}

/// One row of "Failures recorded after the approval are kept".
struct Row {
    /// The scratch folder's suffix.
    name: &'static str,
    /// The failure appended to the row's stream.
    later: Later,
    /// The target whose failure the row keeps.
    kept: &'static str,
    /// The other target, retired with attempt 2.
    other: &'static str,
}

/// Every row of "Failures recorded after the approval are kept".
const ROWS: [Row; 3] = [
    Row {
        name: "change-regressed",
        later: Later::RegressedChange,
        kept: "change",
        other: "1",
    },
    Row {
        name: "task-dead",
        later: Later::DeadTask,
        kept: "1",
        other: "change",
    },
    Row {
        name: "task-regressed",
        later: Later::RegressedTask,
        kept: "1",
        other: "change",
    },
];

/// A scratch project holding the approved change every row uses.
struct Project {
    /// The scratch project root.
    root: PathBuf,
    /// The change folder `001-a`.
    change: PathBuf,
}

/// Builds an approved `001-a` with two tasks, a dead task and a red change.
fn project(name: &str) -> Project {
    let root = scratch("retry_reaction_later", name);
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
    let seal = change_folder_seal(&change).expect("the change folder seals");
    write(&change, ".run/approved", format!("{}\n", seal.as_str()));
    Project { root, change }
}

/// An `approved` event for the given targets at the given timestamp.
fn approved(targets: &[&str], timestamp: &str) -> Envelope {
    Envelope {
        timestamp: timestamp.to_owned(),
        event: Event::Approved(osq_core::event::ApprovedData {
            hash: "sha256:sealed".to_owned(),
            targets: targets.iter().map(|target| (*target).to_owned()).collect(),
        }),
    }
}

/// A target's event stream path.
fn stream_path(change: &Path, target: &str) -> PathBuf {
    change
        .join(".run")
        .join("events")
        .join(format!("{target}.jsonl"))
}

/// A target's active failure marker path.
fn marker_path(change: &Path, target: &str) -> PathBuf {
    let kind = if target == "change" {
        "regressed"
    } else {
        "dead"
    };
    change.join(".run").join(kind).join(format!("{target}.md"))
}

/// Appends one event line to a target's stream, creating its folders.
fn append(change: &Path, target: &str, envelope: &Envelope) {
    let path = stream_path(change, target);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the stream's folders are created");
    }
    let mut text = fs::read_to_string(&path).unwrap_or_default();
    text.push_str(&event_line(envelope));
    text.push('\n');
    fs::write(path, text).expect("the event line is appended");
}

/// The retry payloads a target's stream holds.
fn retries(change: &Path, target: &str) -> Vec<RetryData> {
    fs::read_to_string(stream_path(change, target))
        .unwrap_or_default()
        .lines()
        .filter_map(|line| match parse_event_line(line).ok()?.event {
            Event::Retry(data) => Some(data),
            _ => None,
        })
        .collect()
}

/// Proves every row keeps the later failure and retires the other target.
///
/// Covers: rust-retry/failures-recorded-after-the-approval-are-kept
#[test]
fn failures_recorded_after_the_approval_are_kept() {
    for row in ROWS {
        let name = format!("failures-recorded-after-the-approval-are-kept-{}", row.name);
        let project = project(&name);
        let envelope = approved(&["change", "1"], APPROVED_AT);
        append(
            &project.change,
            row.later.stream(),
            &Envelope {
                timestamp: LATER_AT.to_owned(),
                event: row.later.event(),
            },
        );
        let marker = marker_path(&project.change, row.kept);
        let stream = stream_path(&project.change, row.kept);
        let marker_before = fs::read(&marker).expect("the kept marker reads");
        let stream_before = fs::read(&stream).expect("the kept stream reads");

        let output = RetryFeature
            .react(&Reaction::new(&project.root, &project.change, &envelope))
            .unwrap_or_else(|error| panic!("{}: {error}", row.name));
        assert_eq!(output.text, "", "{}: the reaction prints nothing", row.name);
        assert_eq!(
            fs::read(&marker).expect("the kept marker reads"),
            marker_before,
            "{}: the target keeps its marker",
            row.name
        );
        assert_eq!(
            fs::read(&stream).expect("the kept stream reads"),
            stream_before,
            "{}: the stream gains no retry line",
            row.name
        );
        assert!(
            retries(&project.change, row.kept).is_empty(),
            "{}: the kept target gains no retry",
            row.name
        );

        let retired =
            marker_path(&project.change, row.other).with_file_name(format!("{}.1.md", row.other));
        assert!(retired.is_file(), "{}: the other target retires", row.name);
        let found = retries(&project.change, row.other);
        assert_eq!(found.len(), 1, "{}: one retry for the other", row.name);
        assert_eq!(found[0].attempt, 2, "{}: the other attempt", row.name);
    }
}

/// Proves older, untargeted and change-less failures record nothing.
///
/// Covers: rust-retry/failures-recorded-after-the-approval-are-kept
#[test]
fn older_other_and_untargeted_failures_do_not_skip() {
    let project = project("failures-recorded-after-the-approval-are-kept-unrelated");
    let envelope = approved(&["change", "1"], APPROVED_AT);
    let earlier = "2026-10-01T09:59:59.000Z";
    append(
        &project.change,
        "change",
        &Envelope {
            timestamp: earlier.to_owned(),
            event: Later::RegressedChange.event(),
        },
    );
    append(
        &project.change,
        "change",
        &Envelope {
            timestamp: LATER_AT.to_owned(),
            event: regressed(Some("2"), Some(RegressionReason::SyncConflict)),
        },
    );
    append(
        &project.change,
        "1",
        &Envelope {
            timestamp: earlier.to_owned(),
            event: Later::DeadTask.event(),
        },
    );
    append(
        &project.change,
        "1",
        &Envelope {
            timestamp: LATER_AT.to_owned(),
            event: Event::Dead(DeadData {
                task: "2".to_owned(),
                reason: DeadReason::Blocked,
            }),
        },
    );
    append(
        &project.change,
        "1",
        &Envelope {
            timestamp: LATER_AT.to_owned(),
            event: regressed(None, None),
        },
    );

    RetryFeature
        .react(&Reaction::new(&project.root, &project.change, &envelope))
        .expect("the unrelated failures do not skip a target");

    for (target, attempt) in [("change", 2), ("1", 2)] {
        let retired = marker_path(&project.change, target).with_file_name(format!("{target}.1.md"));
        assert!(retired.is_file(), "{target}: the target retires");
        let found = retries(&project.change, target);
        assert_eq!(found.len(), 1, "{target}: one retry");
        assert_eq!(found[0].attempt, attempt, "{target}: the retry's attempt");
    }
}
