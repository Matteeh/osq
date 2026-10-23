//! Proves the rejection marker, event and output bytes.

mod support;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use osq_kernel_storage::timestamp_ms;

use support::{read, run_args, write};

/// The proposal's bytes, which the move keeps.
const PROPOSAL: &str = "---\ntitle: First\n---\n# Proposal\n";

/// Task one's bytes, which the move keeps.
const TASK_ONE: &str = "---\ntitle: One\n---\n";

/// Task two's bytes, which the move keeps.
const TASK_TWO: &str = "---\ntitle: Two\n---\n";

/// The reason as the invocation gives it, before trimming.
const REASON: &str = "  why \"x\"  ";

/// The reason as the record writes it.
const TRIMMED: &str = "why \"x\"";

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// The current clock in epoch milliseconds.
fn clock() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch")
        .as_millis()
        .try_into()
        .expect("the clock fits in an i64")
}

/// The text one file under `root` holds.
fn text(root: &Path, relative: &str) -> String {
    String::from_utf8(read(root, relative)).expect("the file is UTF-8")
}

/// Proves "Rejection files".
///
/// Covers: rust-approve/rejection-files
#[test]
fn rejection_files() {
    let root = scratch_root("rejection_files");
    write(&root, "openspec/changes/001-a/proposal.md", PROPOSAL);
    write(&root, "openspec/changes/001-a/tasks/1.md", TASK_ONE);
    write(&root, "openspec/changes/001-a/tasks/2.md", TASK_TWO);

    let before = clock();
    let output = run_args(&root, "reject", &["--reason", REASON, "1"])
        .unwrap_or_else(|error| panic!("{error}"));
    let after = clock();

    assert!(
        !root.join("openspec/changes/001-a").exists(),
        "the source is gone"
    );
    let destination = root.join("openspec/changes/rejected/001-a");
    assert!(destination.is_dir(), "the destination holds the folder");
    assert_eq!(
        read(&root, "openspec/changes/rejected/001-a/proposal.md"),
        PROPOSAL.as_bytes(),
        "the proposal keeps its bytes"
    );
    assert_eq!(
        read(&root, "openspec/changes/rejected/001-a/tasks/1.md"),
        TASK_ONE.as_bytes(),
        "task one keeps its bytes"
    );
    assert_eq!(
        read(&root, "openspec/changes/rejected/001-a/tasks/2.md"),
        TASK_TWO.as_bytes(),
        "task two keeps its bytes"
    );

    let marker = text(&root, "openspec/changes/rejected/001-a/.run/rejected.md");
    let timestamp = marker
        .strip_prefix("---\nreason: \"why \\\"x\\\"\"\ntimestamp: \"")
        .and_then(|rest| rest.strip_suffix("\"\n---\n"))
        .expect("the marker holds the reason and timestamp");
    let millis = timestamp_ms(timestamp).expect("the timestamp reads back");
    assert!(
        (before..=after).contains(&millis),
        "the timestamp {timestamp} lies between {before} and {after}"
    );
    assert_eq!(
        marker,
        format!("---\nreason: \"why \\\"x\\\"\"\ntimestamp: \"{timestamp}\"\n---\n"),
        "the marker's bytes"
    );

    assert_eq!(
        text(
            &root,
            "openspec/changes/rejected/001-a/.run/events/change.jsonl"
        ),
        format!(
            "{{\"type\":\"rejected\",\"timestamp\":\"{timestamp}\",\"data\":{{\"reason\":\"why \\\"x\\\"\"}}}}\n"
        ),
        "the event line"
    );

    assert_eq!(
        output.text,
        format!(
            "Rejected 001 (001-a)\n  Reason: {TRIMMED}\n  Destination: {}\n",
            destination.display()
        ),
        "the output"
    );
}
