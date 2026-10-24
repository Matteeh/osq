//! Proves the inbox feature's command, its refusals and its needs-you group.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Command, Feature, FeatureError, Invocation};
use osq_feature_inbox::InboxFeature;

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// A fresh empty scratch home under `CARGO_TARGET_TMPDIR`, named after `root`.
fn home_for(root: &Path) -> PathBuf {
    let base = Path::new(env!("CARGO_TARGET_TMPDIR"));
    let name = root
        .strip_prefix(base)
        .unwrap_or(root)
        .to_string_lossy()
        .replace(['/', '\\'], "_");
    let home = base.join(format!("{name}_home"));
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(&home).unwrap();
    home
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// An invocation of one command with literal arguments.
fn invocation(root: &Path, command: &str, args: &[&str]) -> Invocation {
    Invocation::new(
        root,
        command,
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    )
}

/// Runs the inbox command on a root and returns its output text.
fn inbox_text(root: &Path) -> String {
    InboxFeature::new()
        .with_home(home_for(root))
        .run(&invocation(root, "inbox", &[]))
        .expect("inbox succeeds")
        .text
}

/// The full text a needs-you group and empty running and landed groups give.
fn needs_text(lines: &[&str]) -> String {
    let mut text = String::from("Needs you\n");
    for line in lines {
        text.push_str(line);
        text.push('\n');
    }
    text.push_str("Running\n  (none)\nLanded since last look\n  (none)\n");
    text
}

/// Writes one approved change with a proposal and returns its folder.
fn approved_change(root: &Path, folder: &str, title: &str) -> PathBuf {
    let dir = root.join("openspec/changes").join(folder);
    write(
        &dir.join("proposal.md"),
        &format!("---\ntitle: {title}\nverify: cargo test\n---\n## Goal\n\nGoal.\n"),
    );
    write(&dir.join(".run/approved"), "sha256:0001\n");
    dir
}

/// Writes a change-level `regressed` event and marker with a reason.
fn change_regressed(dir: &Path, reason: &str) {
    write(
        &dir.join(".run/events/change.jsonl"),
        &format!(
            "{{\"type\":\"regressed\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{{\"task\":\"change\",\"reason\":\"{reason}\"}}}}\n"
        ),
    );
    write(
        &dir.join(".run/regressed/change.md"),
        &format!("---\nreason: {reason}\n---\n"),
    );
}

/// Writes one dead task: its file, its event and its dead marker.
fn dead_task(dir: &Path, number: &str, title: &str, reason: &str, body: &str) {
    write(
        &dir.join(format!("tasks/{number}.md")),
        &format!("---\ntitle: {title}\n---\n"),
    );
    write(
        &dir.join(format!(".run/events/{number}.jsonl")),
        &format!(
            "{{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{{\"task\":\"{number}\",\"reason\":\"{reason}\"}}}}\n"
        ),
    );
    write(
        &dir.join(format!(".run/dead/{number}.md")),
        &format!("---\nreason: {reason}\n---\n{body}"),
    );
}

/// Writes one regressed task with its marker's `verification_passed` flag.
fn regressed_task(dir: &Path, number: &str, title: &str, passed: bool) {
    write(
        &dir.join(format!("tasks/{number}.md")),
        &format!("---\ntitle: {title}\n---\n"),
    );
    write(
        &dir.join(format!(".run/events/{number}.jsonl")),
        &format!(
            "{{\"type\":\"regressed\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{{\"task\":\"{number}\",\"reason\":\"verify_red\"}}}}\n"
        ),
    );
    write(
        &dir.join(format!(".run/regressed/{number}.md")),
        &format!("---\nreason: verify_red\nverification_passed: {passed}\n---\n"),
    );
}

/// Proves the inbox feature's name and its one command.
///
/// Covers: rust-inbox/inbox-feature-description
#[test]
fn inbox_feature_description() {
    let feature = InboxFeature::new();
    assert_eq!(feature.name(), "inbox");
    assert_eq!(
        feature.commands(),
        [Command::new(
            "inbox",
            "List the changes that need you, what runs, and what landed",
            "[--json]",
        )]
    );
    assert_ne!(InboxFeature::new(), InboxFeature::at(0));
    assert_eq!(InboxFeature::at(7), InboxFeature::at(7));
    assert_ne!(InboxFeature::at(7), InboxFeature::at(8));
}

/// Proves each refused call and its error text.
///
/// Covers: rust-inbox/inbox-calls-that-are-refused
#[test]
fn inbox_calls_that_are_refused() {
    let root = temp_root("inbox_calls_that_are_refused");
    let cases: [(&str, &[&str], &str); 3] = [
        ("inbox", &["--yaml"], "usage of inbox: takes no arguments"),
        (
            "inbox",
            &["--json", "extra"],
            "usage of inbox: takes no arguments",
        ),
        ("status", &[], "unknown command: status"),
    ];
    for (command, args, text) in cases {
        let error = InboxFeature::new()
            .with_home(home_for(&root))
            .run(&invocation(&root, command, args))
            .expect_err("the call is refused");
        assert_eq!(error.to_string(), text, "{command}");
        if command == "inbox" {
            assert!(matches!(error, FeatureError::Usage { .. }), "{command}");
        } else {
            assert!(
                matches!(error, FeatureError::UnknownCommand { .. }),
                "{command}"
            );
        }
    }
}

/// Proves that a project without an `openspec` folder prints the empty inbox.
///
/// Covers: rust-inbox/empty-project
#[test]
fn empty_project() {
    let root = temp_root("inbox_empty_project");
    assert_eq!(inbox_text(&root), "Inbox empty.\n");
}

/// Proves that a change whose event file does not read fails the command.
///
/// Covers: rust-inbox/change-folder-that-does-not-read
#[test]
fn change_folder_that_does_not_read() {
    let root = temp_root("inbox_change_folder_that_does_not_read");
    let dir = root.join("openspec/changes/001-bad");
    write(&dir.join("proposal.md"), "---\ntitle: Bad\n---\n");
    write(&dir.join("tasks/1.md"), "---\ntitle: When read\n---\n");
    write(&dir.join(".run/events/1.jsonl"), "not json");
    let error = InboxFeature::new()
        .with_home(home_for(&root))
        .run(&invocation(&root, "inbox", &[]))
        .expect_err("the change does not read");
    assert!(matches!(error, FeatureError::Failed { .. }));
    assert!(error.to_string().starts_with("inbox failed: "), "{error}");
}

/// Proves the needs-you lines of the active fixture.
///
/// Covers: rust-inbox/needs-you-of-the-active-fixture
#[test]
fn needs_you_of_the_active_fixture() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/needs-you");
    let lines = [
        "  001: Unplanned with a brief — unplanned — osq plan 001",
        "  002: Unplanned without a brief — unplanned — osq lint 002",
        "  003: Ready plan — osq approve 003",
        "  004: Steps first — do the steps before approval first — osq approve 004",
        "  005: Plain halts — change regressed — osq retry 005 change",
        "  005: Plain halts — task 2: When two runs, it crashes — osq retry 005 2",
        "  006: Blocked task — task 1: When the key is missing, the task blocks — needs steering: blocked (blocked): The task needs the API key from the human. — osq plan 006",
        "  007: Missing entry files — task 1: When the entry is read, it exists — needs steering: blocked (entry_missing): missing entry files src/missing.rs, lib/gone.rs — osq plan 007",
        "  008: Stuck task — task 1: When it runs, it times out — needs steering: stuck (timeout) — osq plan 008",
        "  009: Change regression to steer — needs steering: regression (verify_red) — osq plan 009",
        "  010: Passing scope regression — task 1: When its files change, it recertifies — osq retry 010 1",
    ];
    assert_eq!(inbox_text(&root), needs_text(&lines));
}

/// Proves that items sort by the number an id leads with, not by its bytes.
///
/// Covers: rust-inbox/needs-you-of-the-active-fixture
#[test]
fn needs_you_items_sort_by_number() {
    let root = temp_root("inbox_items_sort_by_number");
    for (folder, title) in [("2-b", "B"), ("10-a", "A")] {
        write(
            &root
                .join("openspec/changes")
                .join(folder)
                .join("proposal.md"),
            &format!("---\ntitle: {title}\n---\n## Goal\n\nPlan.\n"),
        );
    }
    assert_eq!(
        inbox_text(&root),
        needs_text(&[
            "  2: B — unplanned — osq lint 2",
            "  10: A — unplanned — osq lint 10",
        ])
    );
}

/// Proves each change-level trigger name and reason.
///
/// Covers: rust-inbox/needs-you-of-the-active-fixture
#[test]
fn steering_change_triggers() {
    let root = temp_root("inbox_steering_change_triggers");
    let cases = [
        ("001-conflict", "Conflict", "sync_conflict"),
        ("002-requirement", "Requirement", "requirement_changed"),
        ("003-path", "Path", "verify_path_missing"),
        ("004-sync", "Sync", "sync_verify_red"),
    ];
    for (folder, title, reason) in cases {
        change_regressed(&approved_change(&root, folder, title), reason);
    }
    assert_eq!(
        inbox_text(&root),
        needs_text(&[
            "  001: Conflict — needs steering: conflict (sync_conflict) — osq plan 001",
            "  002: Requirement — needs steering: requirement_changed (requirement_changed) — osq plan 002",
            "  003: Path — needs steering: regression (verify_path_missing) — osq plan 003",
            "  004: Sync — needs steering: regression (sync_verify_red) — osq plan 004",
        ])
    );
}

/// Proves the task trigger rules: passing regressions, the first target and needs.
///
/// Covers: rust-inbox/needs-you-of-the-active-fixture
#[test]
fn steering_task_triggers() {
    let root = temp_root("inbox_steering_task_triggers");
    let passed = approved_change(&root, "001-passed", "Passed");
    regressed_task(&passed, "1", "When it fails", true);
    let ordered = approved_change(&root, "002-order", "Order");
    dead_task(&ordered, "1", "When one crashes", "crashed", "");
    dead_task(&ordered, "2", "When two blocks", "blocked", "");
    let entry = approved_change(&root, "003-entry", "Entry");
    dead_task(&entry, "1", "When entry is missing", "entry_missing", "");
    assert_eq!(
        inbox_text(&root),
        needs_text(&[
            "  001: Passed — task 1: When it fails — needs steering: regression (verify_red) — osq plan 001",
            "  002: Order — task 2: When two blocks — needs steering: blocked (blocked): (not stated) — osq plan 002",
            "  003: Entry — task 1: When entry is missing — needs steering: blocked (entry_missing): (not stated) — osq plan 003",
        ])
    );
}

/// Proves every placeholder verify row.
///
/// Covers: rust-inbox/placeholder-verifies
#[test]
fn placeholder_verifies() {
    let root = temp_root("inbox_placeholder_verifies");
    let cases: [(&str, &str); 5] = [
        (
            "node -e \"process.exit(0)\"",
            "  001: Plan — unplanned — osq plan 001",
        ),
        (
            "node --eval 'process.exit( 0 );;'",
            "  001: Plan — unplanned — osq plan 001",
        ),
        (
            "node -e \"process.exit(1)\"",
            "  001: Plan — osq approve 001",
        ),
        (
            "node -p \"process.exit(0)\"",
            "  001: Plan — osq approve 001",
        ),
        (
            "node -e \"process.exit(0)\" extra",
            "  001: Plan — osq approve 001",
        ),
    ];
    for (verify, line) in cases {
        let _ = fs::remove_dir_all(&root);
        let dir = root.join("openspec/changes/001-plan");
        write(&dir.join("brief.md"), "### Goal\n\nPlan this.\n");
        write(
            &dir.join("proposal.md"),
            &format!("---\ntitle: Plan\nverify: {verify}\n---\n## Goal\n\nPlan.\n"),
        );
        assert_eq!(inbox_text(&root), needs_text(&[line]), "{verify}");
    }
}

/// Proves that a blocked task with no stated need prints `(not stated)`.
///
/// Covers: rust-inbox/blocked-task-without-a-stated-need
#[test]
fn blocked_task_without_a_stated_need() {
    let root = temp_root("inbox_blocked_task_without_a_stated_need");
    let dir = root.join("openspec/changes/001-ask");
    write(
        &dir.join("proposal.md"),
        "---\ntitle: Ask\nverify: cargo test -p osq-feature-inbox\n---\n## Goal\n\nAsk.\n",
    );
    write(&dir.join(".run/approved"), "sha256:0001\n");
    write(
        &dir.join("tasks/1.md"),
        "---\ntitle: When asked, it blocks\n---\n",
    );
    write(
        &dir.join(".run/events/1.jsonl"),
        "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n{\"type\":\"dead\",\"timestamp\":\"2026-10-01T10:01:00.000Z\",\"data\":{\"task\":\"1\",\"reason\":\"blocked\"}}\n",
    );
    write(&dir.join(".run/dead/1.md"), "---\nreason: blocked\n---\n");
    assert_eq!(
        inbox_text(&root),
        needs_text(&[
            "  001: Ask — task 1: When asked, it blocks — needs steering: blocked (blocked): (not stated) — osq plan 001"
        ])
    );
}
