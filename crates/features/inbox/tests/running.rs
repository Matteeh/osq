//! Proves the Running group's lines.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Feature, Invocation};
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

/// Runs the inbox command on a root at a fixed time.
fn inbox_text(root: &Path, now_ms: i64) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::at(now_ms)
        .with_home(home_for(root))
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// Runs the inbox command on a root with the system clock.
fn inbox_text_now(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .with_home(home_for(root))
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The system clock in epoch milliseconds.
fn system_now_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or_default()
}

/// The full text running lines give without needs-you or landed items.
fn running_text(lines: &[&str]) -> String {
    let mut text = String::from("Needs you\n  (none)\nRunning\n");
    if lines.is_empty() {
        text.push_str("  (none)\nLanded since last look\n  (none)\n");
    } else {
        for line in lines {
            text.push_str(line);
            text.push('\n');
        }
        text.push_str("Landed since last look\n  (none)\n");
    }
    text
}

/// Writes the approved change `001-run` with one task and its stream.
fn change(root: &Path, number: &str, title: &str, events: &str) {
    let dir = root.join("openspec/changes/001-run");
    write(
        &dir.join("proposal.md"),
        "---\ntitle: Run\nverify: cargo test\n---\n## Goal\n\nRun.\n",
    );
    write(&dir.join(".run/approved"), "sha256:0001\n");
    write(
        &dir.join(format!("tasks/{number}.md")),
        &format!("---\ntitle: {title}\n---\n"),
    );
    write(&dir.join(format!(".run/events/{number}.jsonl")), events);
}

/// One started event for a task.
fn started() -> &'static str {
    "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n"
}

/// Writes a task's running lock.
fn lock(root: &Path, number: &str, pid: u64, started_at: i64) {
    write(
        &root
            .join("openspec/changes/001-run")
            .join(format!(".run/running/{number}.pid")),
        &format!("{{\"pid\":{pid},\"startedAt\":{started_at}}}"),
    );
}

/// Covers: rust-inbox/running-tasks
#[test]
fn running_tasks() {
    let root = temp_root("inbox_running_tasks");
    let own_pid = u64::from(std::process::id());
    let done = "{\"type\":\"started\",\"timestamp\":\"2026-10-01T10:00:00.000Z\",\"data\":{\"attempt\":1}}\n{\"type\":\"done\",\"timestamp\":\"2026-10-01T10:01:00.000Z\",\"data\":{\"task\":\"4\"}}\n";
    let rows: [(&str, &str, u64, i64, &str); 7] = [
        ("1", "When one runs", own_pid, 1_760_000_025_000, started()),
        ("2", "When two runs", own_pid, 1_760_000_099_600, started()),
        (
            "3",
            "When three runs",
            4_194_305,
            1_760_000_000_000,
            started(),
        ),
        ("4", "When four is done", own_pid, 1_760_000_000_000, done),
        ("5", "When five runs", own_pid, 1_760_000_200_000, started()),
        ("6", "When six runs", own_pid, 1_759_999_980_000, started()),
        (
            "7",
            "When seven runs",
            own_pid,
            1_760_000_090_500,
            started(),
        ),
    ];
    for (number, title, pid, started_at, events) in rows {
        change(&root, number, title, events);
        lock(&root, number, pid, started_at);
    }
    assert_eq!(
        inbox_text(&root, 1_760_000_100_000),
        running_text(&[
            "  001: Run — task 1: When one runs — 1m 15s — osq show 001",
            "  001: Run — task 2: When two runs — 0s — osq show 001",
            "  001: Run — task 5: When five runs — 0s — osq show 001",
            "  001: Run — task 6: When six runs — 2m — osq show 001",
            "  001: Run — task 7: When seven runs — 10s — osq show 001",
        ])
    );
}

/// Covers: rust-inbox/running-tasks
#[test]
fn pid_zero_is_not_live() {
    let root = temp_root("inbox_running_pid_zero");
    change(&root, "1", "When zero runs", started());
    lock(&root, "1", 0, 1_760_000_000_000);
    assert_eq!(inbox_text(&root, 1_760_000_100_000), "Inbox empty.\n");
}

/// Covers: rust-inbox/running-tasks
#[test]
fn system_clock_drives_running_time() {
    let root = temp_root("inbox_running_system_clock");
    change(&root, "1", "When now runs", started());
    lock(
        &root,
        "1",
        u64::from(std::process::id()),
        system_now_ms() - 5000,
    );
    let text = inbox_text_now(&root);
    assert!(
        text.contains("  001: Run — task 1: When now runs — "),
        "{text}"
    );
    assert!(!text.contains(" — 0s — "), "{text}");
}
