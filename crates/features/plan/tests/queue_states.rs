//! Proves the queue item hash and the states change folders give queue items.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The one queue item every state and hash row uses.
const QUEUE: &str = "## [a] First item\n\nDepends on: nothing\n\nA brief.\n";

/// The item's hash, as TypeScript's `parseQueue` computes it.
const HASH_LINE: &str =
    "queue_hash: sha256:c35d97849fbe6b40784be4564395126955b5465cb25c063c92e0a37cd2609dcb";

/// One `started` event line for task 1.
const STARTED: &str =
    "{\"type\":\"started\",\"timestamp\":\"2026-10-04T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n";

/// One `regressed` change event line.
const REGRESSED: &str = "{\"type\":\"regressed\",\"timestamp\":\"2026-10-04T10:01:00.000Z\",\"data\":{\"task\":\"change\",\"reason\":\"worktree_dirty\"}}\n";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes the repository's `openspec/queue.md`.
fn write_queue(root: &Path) {
    let folder = root.join("openspec");
    fs::create_dir_all(&folder).expect("the openspec folder is created");
    fs::write(folder.join("queue.md"), QUEUE).expect("the queue file is written");
}

/// Writes one file under a base folder, creating its parent folders.
fn write(base: &Path, relative: &str, text: &str) {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes a brief with the row's `queue_item` and optional `queue_hash` lines.
fn write_brief(folder: &Path, item_line: Option<&str>, hash_line: Option<&str>) {
    let mut text = String::from("---\n");
    if let Some(line) = item_line {
        text.push_str(line);
        text.push('\n');
    }
    if let Some(line) = hash_line {
        text.push_str(line);
        text.push('\n');
    }
    text.push_str("---\n\nA brief.\n");
    write(folder, "brief.md", &text);
}

/// Creates a change folder and writes its brief.
fn folder(
    root: &Path,
    relative: &str,
    item_line: Option<&str>,
    hash_line: Option<&str>,
) -> PathBuf {
    let path = root.join("openspec").join("changes").join(relative);
    fs::create_dir_all(&path).expect("the change folder is created");
    write_brief(&path, item_line, hash_line);
    path
}

/// Writes the proposal and task file an active folder needs.
fn write_active_files(path: &Path) {
    write(
        path,
        "proposal.md",
        "---\ntitle: P\n---\n\n## Goal\n\nA goal.\n",
    );
    write(path, "tasks/1.md", "---\ntitle: T\n---\n");
}

/// Creates an active change folder with a brief, proposal and task file.
fn active(root: &Path, name: &str, item_line: Option<&str>, hash_line: Option<&str>) -> PathBuf {
    let path = folder(root, name, item_line, hash_line);
    write_active_files(&path);
    path
}

/// Runs the feature's `queue` command on one root.
fn run_queue(root: &Path) -> Result<Output, FeatureError> {
    PlanFeature.run(&Invocation::new(root, "queue", Vec::new()))
}

/// Builds a row's active folder with a `started` event and a running lock.
fn running(root: &Path) {
    let path = active(root, "001-a", Some("queue_item: a"), Some(HASH_LINE));
    write(&path, ".run/approved", "sha256:0001\n");
    write(&path, ".run/events/1.jsonl", STARTED);
    write(&path, ".run/running/1.pid", "123\n");
}

/// Builds a row's active folder with a change regression event.
fn dead(root: &Path) {
    let path = active(root, "001-a", Some("queue_item: a"), Some(HASH_LINE));
    write(&path, ".run/approved", "sha256:0001\n");
    write(&path, ".run/events/change.jsonl", REGRESSED);
}

/// Builds a row's unreadable active folder and one rejected folder.
fn unreadable_with_rejected(root: &Path) {
    let path = active(root, "002-a", Some("queue_item: a"), Some(HASH_LINE));
    write(&path, ".run/events/1.jsonl", "not json\n");
    let _ = folder(
        root,
        "rejected/001-a",
        Some("queue_item: a"),
        Some(HASH_LINE),
    );
}

/// Builds a row's unreadable active folder.
fn unreadable(root: &Path) {
    let path = active(root, "002-a", Some("queue_item: a"), Some(HASH_LINE));
    write(&path, ".run/events/1.jsonl", "not json\n");
}

/// Builds a row's archived, active and hashless rejected folder.
fn archived_before_active(root: &Path) {
    let _ = folder(
        root,
        "archive/001-a",
        Some("queue_item: a"),
        Some(HASH_LINE),
    );
    let _ = active(root, "002-a", Some("queue_item: a"), Some(HASH_LINE));
    let _ = folder(root, "rejected/003-a", Some("queue_item: a"), None);
}

/// Builds a row's two rejected folders, the first hashless.
fn two_rejected(root: &Path) {
    let _ = folder(root, "rejected/001-a", Some("queue_item: a"), None);
    let _ = folder(
        root,
        "rejected/002-a",
        Some("queue_item: a"),
        Some(HASH_LINE),
    );
}

/// Builds a row's active folder whose name has no leading digits.
fn no_digits(root: &Path) {
    let _ = active(root, "x-a", Some("queue_item: a"), Some(HASH_LINE));
}

/// Builds a row's active folder whose `queue_item` needs trimming.
fn trimmed_item(root: &Path) {
    let _ = active(
        root,
        "001-a",
        Some("queue_item: \"  a  \""),
        Some(HASH_LINE),
    );
}

/// Builds a row's active folder whose `queue_item` is not a string.
fn numeric_item(root: &Path) {
    let _ = active(root, "001-a", Some("queue_item: 7"), Some(HASH_LINE));
}

/// Builds a row's active folder without a brief.
fn no_brief(root: &Path) {
    let path = root.join("openspec").join("changes").join("001-a");
    fs::create_dir_all(&path).expect("the change folder is created");
    write_active_files(&path);
}

/// Builds a row's active folder without a proposal.
fn no_proposal(root: &Path) {
    let path = folder(root, "001-a", Some("queue_item: a"), Some(HASH_LINE));
    write(&path, "tasks/1.md", "---\ntitle: T\n---\n");
}

/// Proves every row of "States of single items".
///
/// Covers: rust-plan/states-of-single-items
#[test]
fn states_of_single_items() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, &str); 11] = [
        (
            "running",
            running,
            "  a: First item [running] change: 001 rejections: 0",
        ),
        (
            "dead",
            dead,
            "  a: First item [dead] change: 001 rejections: 0",
        ),
        (
            "unreadable active and rejected",
            unreadable_with_rejected,
            "  a: First item [rejected] change: 001 rejections: 1",
        ),
        (
            "unreadable active",
            unreadable,
            "  a: First item [unplanned] rejections: 0",
        ),
        (
            "archived before active",
            archived_before_active,
            "  a: First item [landed] change: 001 rejections: 1",
        ),
        (
            "last rejected",
            two_rejected,
            "  a: First item [rejected] change: 002 rejections: 2",
        ),
        (
            "no leading digits",
            no_digits,
            "  a: First item [planned] change: x-a rejections: 0",
        ),
        (
            "trimmed queue item",
            trimmed_item,
            "  a: First item [planned] change: 001 rejections: 0",
        ),
        (
            "numeric queue item",
            numeric_item,
            "  a: First item [unplanned] rejections: 0",
        ),
        (
            "no brief",
            no_brief,
            "  a: First item [unplanned] rejections: 0",
        ),
        (
            "no proposal",
            no_proposal,
            "  a: First item [unplanned] rejections: 0",
        ),
    ];
    for (name, setup, line) in rows {
        let root = scratch(name);
        write_queue(&root);
        setup(&root);
        let expected = format!("Queue:\n{line}");
        assert_eq!(
            run_queue(&root).expect("the queue reads").text,
            expected,
            "row {name}"
        );
    }
}

/// Proves every row of "Changed since planned".
///
/// Covers: rust-plan/changed-since-planned
#[test]
fn changed_since_planned() {
    let rows: [(&str, Option<&str>, &str); 4] = [
        (
            "matching hash",
            Some(HASH_LINE),
            "  a: First item [planned] change: 001 rejections: 0",
        ),
        (
            "uppercase hash",
            Some(
                "queue_hash: sha256:C35D97849FBE6B40784BE4564395126955B5465CB25C063C92E0A37CD2609DCB",
            ),
            "  a: First item [planned] change: 001 rejections: 0 changed since planned",
        ),
        (
            "numeric hash",
            Some("queue_hash: 7"),
            "  a: First item [planned] change: 001 rejections: 0 changed since planned",
        ),
        (
            "missing hash",
            None,
            "  a: First item [planned] change: 001 rejections: 0 changed since planned",
        ),
    ];
    for (name, hash_line, line) in rows {
        let root = scratch(name);
        write_queue(&root);
        let _ = active(&root, "001-a", Some("queue_item: a"), hash_line);
        let expected = format!("Queue:\n{line}");
        assert_eq!(
            run_queue(&root).expect("the queue reads").text,
            expected,
            "row {name}"
        );
    }
}

/// Builds a root with two archived and two active folders naming one item.
fn archived_ambiguity(root: &Path) {
    for name in ["001-a", "002-a"] {
        let _ = folder(
            root,
            &format!("archive/{name}"),
            Some("queue_item: a"),
            Some(HASH_LINE),
        );
    }
    for name in ["003-a", "004-a"] {
        let _ = active(root, name, Some("queue_item: a"), Some(HASH_LINE));
    }
}

/// Builds a root with two active folders naming one item.
fn active_ambiguity(root: &Path) {
    for name in ["001-a", "002-a"] {
        let _ = active(root, name, Some("queue_item: a"), Some(HASH_LINE));
    }
}

/// Proves every row of "Ambiguous associations".
///
/// Covers: rust-plan/ambiguous-associations
#[test]
fn ambiguous_associations() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, &str); 2] = [
        (
            "archived first",
            archived_ambiguity,
            "Ambiguous queue association for \"a\": multiple archived changes (001-a, 002-a)",
        ),
        (
            "active",
            active_ambiguity,
            "Ambiguous queue association for \"a\": multiple active changes (001-a, 002-a)",
        ),
    ];
    for (name, setup, message) in rows {
        let root = scratch(name);
        write_queue(&root);
        setup(&root);
        match run_queue(&root) {
            Err(FeatureError::Failed {
                command,
                message: actual,
                ..
            }) => assert_eq!(
                (command.as_str(), actual.as_str()),
                ("queue", message),
                "row {name}"
            ),
            other => panic!("row {name} expects a Failed error, got {other:?}"),
        }
    }
}
