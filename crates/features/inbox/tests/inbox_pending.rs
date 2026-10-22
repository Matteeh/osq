//! Proves the pending-record cards and the order the inbox lists them in.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;
use osq_kernel_storage::watch_state_dir;

/// A fresh scratch project root, with anything at that name removed.
fn project(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Runs the inbox command on a root at a fixed time.
fn inbox_text_at(root: &Path, now_ms: i64) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::at(now_ms)
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// Runs the inbox command on a root with the system clock.
fn inbox_text(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The full text three line groups give.
fn text(needs_you: &[&str], running: &[&str], landed: &[&str]) -> String {
    let mut text = String::from("Needs you\n");
    if needs_you.is_empty() {
        text.push_str("  (none)\n");
    } else {
        for line in needs_you {
            text.push_str(line);
            text.push('\n');
        }
    }
    text.push_str("Running\n");
    if running.is_empty() {
        text.push_str("  (none)\n");
    } else {
        for line in running {
            text.push_str(line);
            text.push('\n');
        }
    }
    text.push_str("Landed since last look\n");
    if landed.is_empty() {
        text.push_str("  (none)\n");
    } else {
        for line in landed {
            text.push_str(line);
            text.push('\n');
        }
    }
    text
}

/// Writes an active change with an optional approval and task list.
fn active(
    root: &Path,
    folder: &str,
    title: &str,
    approved: bool,
    tasks: &[(&str, &str)],
) -> PathBuf {
    let dir = root.join("openspec/changes").join(folder);
    write(
        &dir.join("proposal.md"),
        &format!("---\ntitle: {title}\nverify: cargo test\n---\n## Goal\n\nGoal.\n"),
    );
    if approved {
        write(&dir.join(".run/approved"), "sha256:0001\n");
    }
    for (number, title) in tasks {
        write(
            &dir.join(format!("tasks/{number}.md")),
            &format!("---\ntitle: {title}\n---\n"),
        );
    }
    dir
}

/// Writes an archived change with a title and no archived event.
fn archived(root: &Path, folder: &str, title: &str) -> PathBuf {
    let dir = root.join("openspec/changes/archive").join(folder);
    write(
        &dir.join("proposal.md"),
        &format!("---\ntitle: {title}\nverify: cargo test\n---\n## Goal\n\nArchived.\n"),
    );
    dir
}

/// Writes one change's `.run/paused.md`.
fn pause(dir: &Path, frontmatter: &str, body: &str) {
    write(
        &dir.join(".run/paused.md"),
        &format!("---\n{frontmatter}\n---\n{body}\n"),
    );
}

/// Writes a task's started event.
fn started(dir: &Path, number: &str) {
    write(
        &dir.join(format!(".run/events/{number}.jsonl")),
        "{\"type\":\"started\",\"timestamp\":\"2026-10-22T12:00:00.000Z\",\"data\":{\"attempt\":1}}\n",
    );
}

/// Writes an active change and its usage-limit pause.
fn paused_active(
    root: &Path,
    folder: &str,
    title: &str,
    approved: bool,
    tasks: &[(&str, &str)],
    frontmatter: &str,
) -> PathBuf {
    let dir = active(root, folder, title, approved, tasks);
    pause(&dir, frontmatter, "usage limit reached");
    dir
}

/// Writes a task's running lock.
fn lock(dir: &Path, number: &str, pid: u64, started_at: i64) {
    write(
        &dir.join(format!(".run/running/{number}.pid")),
        &format!("{{\"pid\":{pid},\"startedAt\":{started_at}}}"),
    );
}

/// Removes one project's watch state folder when a row ends.
struct WatchFolder(
    /// The folder to remove.
    PathBuf,
);

impl Drop for WatchFolder {
    /// Removes the folder, ignoring a missing one.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Writes an `after-land.json` under the real home's watch state folder.
fn after_land(root: &Path, text: &str) -> WatchFolder {
    let home = PathBuf::from(std::env::var_os("HOME").expect("HOME is set"));
    let folder = watch_state_dir(root, &home);
    write(&folder.join("after-land.json"), text);
    WatchFolder(folder)
}

/// Writes `openspec/.run/autopilot-stop.md`.
fn stop(root: &Path, frontmatter: &str, body: &str) {
    write(
        &root.join("openspec/.run/autopilot-stop.md"),
        &format!("---\n{frontmatter}\nat: 2026-10-22T10:00:00.000Z\n---\n{body}"),
    );
}

/// One paused-task table row: folder, title, approval, tasks and pause.
type PausedRow<'a> = (&'a str, &'a str, bool, &'a [(&'a str, &'a str)], &'a str);

/// Covers: rust-inbox/paused-tasks
#[test]
fn paused_tasks() {
    let root = project("inbox_pending_paused_tasks");
    let own_pid = u64::from(std::process::id());
    let rows: [PausedRow<'_>; 8] = [
        (
            "001-wait",
            "Wait",
            true,
            &[("1", "When one waits"), ("2", "When two waits")],
            "task: \"2\"\nuntil: \"2026-10-22T12:30:00.000Z\"\nsource: wait",
        ),
        (
            "002-live",
            "Live",
            true,
            &[("1", "When live runs")],
            "task: \"1\"\nuntil: \"2026-10-22T13:00:00.000Z\"\nsource: wait",
        ),
        (
            "003-passed",
            "Passed",
            true,
            &[("1", "When it runs")],
            "task: \"1\"\nuntil: \"2026-10-22T11:59:59.999Z\"\nsource: wait",
        ),
        (
            "004-unapproved",
            "Unapproved",
            false,
            &[("1", "When it runs")],
            "task: \"1\"\nuntil: \"2026-10-22T13:00:00.000Z\"\nsource: wait",
        ),
        (
            "005-notask",
            "No task",
            true,
            &[("1", "When it runs")],
            "task: \"9\"\nuntil: \"2026-10-22T13:00:00.000Z\"\nsource: wait",
        ),
        (
            "006-number",
            "Number",
            true,
            &[("1", "When it runs")],
            "task: 1\nuntil: \"2026-10-22T13:00:00.000Z\"\nsource: wait",
        ),
        (
            "007-source",
            "Source",
            true,
            &[("1", "When it runs")],
            "task: \"1\"\nuntil: \"2026-10-22T13:00:00.000Z\"\nsource: later",
        ),
        (
            "008-harness",
            "Harness",
            true,
            &[("1", "When it runs")],
            "task: \"1\"\nuntil: \"2026-10-23T00:05:00.000Z\"\nsource: harness",
        ),
    ];
    for (folder, title, approved, tasks, frontmatter) in rows {
        let dir = paused_active(&root, folder, title, approved, tasks, frontmatter);
        if folder == "002-live" {
            started(&dir, "1");
            lock(&dir, "1", own_pid, 1_792_670_400_000);
        }
    }
    assert_eq!(
        inbox_text_at(&root, 1_792_670_400_000),
        text(
            &["  004: Unapproved — osq approve 004"],
            &[
                "  001: Wait — task 2: When two waits — paused until 2026-10-22 12:30 UTC — osq show 001",
                "  002: Live — task 1: When live runs — 0s — osq show 002",
                "  008: Harness — task 1: When it runs — paused until 2026-10-23 00:05 UTC — osq show 008",
            ],
            &[],
        )
    );
}

/// Covers: rust-inbox/failed-after-land-commands
#[test]
fn failed_after_land_commands() {
    let cases: [(&str, Option<&str>, Option<&str>); 6] = [
        (
            "shipped",
            Some(
                "{\"change\":\"030-shipped\",\"command\":\"pnpm build\",\"exitCode\":1,\"failedAt\":\"2026-10-22T10:00:00.000Z\"}",
            ),
            Some("  030: Shipped — after-land command failed — osq land 030"),
        ),
        (
            "gone",
            Some(
                "{\"change\":\"031-gone\",\"command\":\"pnpm build\",\"exitCode\":2,\"failedAt\":\"2026-10-22T10:00:00.000Z\"}",
            ),
            Some("  031: 031-gone — after-land command failed — osq land 031"),
        ),
        (
            "plain",
            Some(
                "{\"change\":\"plain\",\"command\":\"pnpm build\",\"exitCode\":1,\"failedAt\":\"2026-10-22T10:00:00.000Z\"}",
            ),
            Some("  plain: plain — after-land command failed — osq land plain"),
        ),
        (
            "string-exit",
            Some(
                "{\"change\":\"030-shipped\",\"command\":\"pnpm build\",\"exitCode\":\"1\",\"failedAt\":\"2026-10-22T10:00:00.000Z\"}",
            ),
            None,
        ),
        ("not-json", Some("not json"), None),
        ("no-file", None, None),
    ];
    for (name, record, line) in cases {
        let root = project(&format!("inbox_pending_after_land_{name}"));
        archived(&root, "030-shipped", "Shipped");
        let _guard = record.map(|record| after_land(&root, record));
        let expected = line.map_or_else(
            || String::from("Inbox empty.\n"),
            |line| text(&[line], &[], &[]),
        );
        assert_eq!(inbox_text(&root), expected, "{name}");
    }
}

/// One autopilot-stop table row: name, frontmatter, body, queue suffix and line.
type StopRow<'a> = (&'a str, &'a str, &'a str, Option<&'a str>, Option<&'a str>);

/// Covers: rust-inbox/autopilot-stops
#[test]
fn autopilot_stops() {
    let default_queue =
        "# q\n\n## [next-item] The next item\n\nDepends on: nothing\n\n### Goal\n\nX.\n";
    let cases: [StopRow<'_>; 7] = [
        (
            "halted",
            "reason: halted\nitem: stopped-item\nchange: \"040\"\ncommand: osq retry 040 1",
            "task 1 died:\n  verify_red\n",
            None,
            Some(
                "  040: Stopped — autopilot stopped: halted: task 1 died: verify_red — osq retry 040 1",
            ),
        ),
        (
            "land-stopped",
            "reason: land_stopped\nitem: gone-item\nchange: \"041\"\ncommand: osq land 041",
            "",
            None,
            Some("  041: 041 — autopilot stopped: land_stopped — osq land 041"),
        ),
        (
            "short-number",
            "reason: halted\nitem: stopped-item\nchange: \"40\"\ncommand: osq retry 040 1",
            "",
            None,
            Some("  40: Stopped — autopilot stopped: halted — osq retry 040 1"),
        ),
        (
            "queue-title",
            "reason: plan_refused\nitem: next-item\ncommand: osq queue approve",
            "",
            None,
            Some(
                "  next-item: The next item — autopilot stopped: plan_refused — osq queue approve",
            ),
        ),
        (
            "bad-queue",
            "reason: queue_unreadable\nitem: next-item\ncommand: osq queue approve",
            "bad slug\n",
            Some("## [Bad Slug] Broken\n\nDepends on: nothing\n\nY.\n"),
            Some(
                "  next-item: next-item — autopilot stopped: queue_unreadable: bad slug — osq queue approve",
            ),
        ),
        (
            "other-item",
            "reason: not_approved\nitem: other-item\ncommand: osq queue approve",
            "",
            None,
            Some("  other-item: other-item — autopilot stopped: not_approved — osq queue approve"),
        ),
        (
            "bad-reason",
            "reason: bogus\nitem: next-item\ncommand: osq queue approve",
            "",
            None,
            None,
        ),
    ];
    for (name, frontmatter, body, appended, line) in cases {
        let root = project(&format!("inbox_pending_autopilot_{name}"));
        archived(&root, "040-stopped", "Stopped");
        let queue = format!("{default_queue}{}", appended.unwrap_or_default());
        write(&root.join("openspec/queue.md"), &queue);
        stop(&root, frontmatter, body);
        let expected = line.map_or_else(
            || String::from("Inbox empty.\n"),
            |line| text(&[line], &[], &[]),
        );
        assert_eq!(inbox_text(&root), expected, "{name}");
    }
}

/// Covers: rust-inbox/autopilot-stops
#[test]
fn autopilot_stop_folder_matches() {
    let cases = [("040", "40"), ("40", "40")];
    for (folder, change) in cases {
        let root = project(&format!("inbox_pending_autopilot_match_{folder}_{change}"));
        archived(&root, folder, "Exact");
        stop(
            &root,
            &format!("reason: halted\nitem: item\nchange: \"{change}\"\ncommand: osq retry 1"),
            "",
        );
        let line = format!("  {change}: Exact — autopilot stopped: halted — osq retry 1");
        assert_eq!(
            inbox_text(&root),
            text(&[line.as_str()], &[], &[]),
            "{folder} {change}"
        );
    }
}

/// Covers: rust-inbox/items-of-one-change-in-typescript-s-order
#[test]
fn items_of_one_change_in_typescripts_order() {
    let root = project("inbox_pending_items_of_one_change");
    active(&root, "049-draft", "Draft", false, &[]);
    let all = archived(&root, "050-all", "All");
    write(
        &all.join(".run/events/change.jsonl"),
        "{\"type\":\"validator_ran\",\"timestamp\":\"2026-10-22T09:00:00.000Z\",\"data\":{\"outcome\":\"failed\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1,\"exitCode\":null,\"scenarios\":1,\"findings\":[],\"restored\":[],\"output\":\"boom\"}}\n",
    );
    let _guard = after_land(
        &root,
        "{\"change\":\"050-all\",\"command\":\"pnpm build\",\"exitCode\":1,\"failedAt\":\"2026-10-22T10:00:00.000Z\"}",
    );
    stop(
        &root,
        "reason: land_stopped\nitem: all-item\nchange: \"050\"\ncommand: osq land 050",
        "",
    );
    assert_eq!(
        inbox_text(&root),
        text(
            &[
                "  049: Draft — osq approve 049",
                "  050: All — after-land command failed — osq land 050",
                "  050: All — validator failed 1× in a row: boom — osq show 050",
                "  050: All — autopilot stopped: land_stopped — osq land 050",
            ],
            &[],
            &[],
        )
    );
}
