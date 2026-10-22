//! Proves reading the records that wait for a human: usage pauses, autopilot
//! stops and failed after-land commands.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    AfterLandFailure, AutopilotStop, PauseRecord, read_after_land_failure, read_autopilot_stop,
    read_usage_pause, watch_state_dir,
};

/// A fresh temporary folder for one row, with nothing left at its name.
fn temp_folder(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_pending_records")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// A pause record with the row's values.
fn pause(task: &str, until: &str, source: &str, error: Option<&str>) -> PauseRecord {
    PauseRecord {
        task: String::from(task),
        until: String::from(until),
        source: String::from(source),
        error: error.map(String::from),
    }
}

/// The frontmatter lines and body of a stop record with the base values.
fn base_stop(reason: &str, change: Option<&str>) -> String {
    let mut lines = format!("reason: {reason}\nitem: stopped-item\n");
    if let Some(change) = change {
        lines.push_str("change: \"");
        lines.push_str(change);
        lines.push_str("\"\n");
    }
    lines.push_str("command: osq retry 040 1\nat: 2026-10-22T10:00:00.000Z\n");
    lines
}

/// A stop record with the base values and the row's id and detail.
fn stop(change: Option<&str>, detail: Option<&str>) -> AutopilotStop {
    AutopilotStop {
        reason: String::from("halted"),
        item: String::from("stopped-item"),
        change: change.map(String::from),
        command: String::from("osq retry 040 1"),
        at: String::from("2026-10-22T10:00:00.000Z"),
        detail: detail.map(String::from),
    }
}

/// Writes a row's `.run/paused.md`, its frontmatter lines and its body.
fn write_pause(folder: &Path, frontmatter: &str, body: &str) {
    write(
        &folder.join(".run/paused.md"),
        &format!("---\n{frontmatter}\n---\n{body}"),
    );
}

/// Proves every row of "Pause records".
///
/// Covers: rust-storage/pause-records
#[test]
fn pause_records() {
    let rows: [(&str, &str, &str, Option<PauseRecord>); 9] = [
        (
            "quoted",
            "task: \"2\"\nuntil: \"2026-10-22T12:30:00.000Z\"\nsource: wait",
            "usage limit reached\n",
            Some(pause("2", "2026-10-22T12:30:00.000Z", "wait", None)),
        ),
        (
            "error",
            "task: \"1\"\nuntil: 2026-10-23T00:05:00.000Z\nsource: harness",
            "  rate limited  \n",
            Some(pause(
                "1",
                "2026-10-23T00:05:00.000Z",
                "harness",
                Some("rate limited"),
            )),
        ),
        (
            "empty body",
            "task: \"1\"\nuntil: \"2026-10-23T00:05:00.000Z\"\nsource: wait",
            "\n",
            Some(pause("1", "2026-10-23T00:05:00.000Z", "wait", None)),
        ),
        (
            "number task",
            "task: 1\nuntil: \"2026-10-23T00:05:00.000Z\"\nsource: wait",
            "usage limit reached\n",
            None,
        ),
        (
            "no until",
            "task: \"1\"\nsource: wait",
            "usage limit reached\n",
            None,
        ),
        (
            "bad until",
            "task: \"1\"\nuntil: soon\nsource: wait",
            "usage limit reached\n",
            None,
        ),
        (
            "bad source",
            "task: \"1\"\nuntil: \"2026-10-23T00:05:00.000Z\"\nsource: later",
            "usage limit reached\n",
            None,
        ),
        (
            "no source",
            "task: \"1\"\nuntil: \"2026-10-23T00:05:00.000Z\"",
            "usage limit reached\n",
            None,
        ),
        ("unparsable", "task: [", "usage limit reached\n", None),
    ];
    for (name, frontmatter, body, expected) in rows {
        let folder = temp_folder(&format!("pause_{name}"));
        write_pause(&folder, frontmatter, body);
        assert_eq!(read_usage_pause(&folder), expected, "row {name}");
    }
}

/// Proves a change folder without a pause file reads no pause.
///
/// Covers: rust-storage/no-pause-file
#[test]
fn no_pause_file() {
    let folder = temp_folder("no_pause");
    fs::create_dir_all(&folder).unwrap();
    assert_eq!(read_usage_pause(&folder), None);
}

/// Writes a project's `openspec/.run/autopilot-stop.md`.
fn write_stop(project_root: &Path, frontmatter: &str, body: &str) {
    write(
        &project_root.join("openspec/.run/autopilot-stop.md"),
        &format!("---\n{frontmatter}\n---\n{body}"),
    );
}

/// Proves every row of "Stop records".
///
/// Covers: rust-storage/stop-records
#[test]
fn stop_records() {
    let base = base_stop("halted", Some("040"));
    let no_change = base_stop("halted", None);
    let rows: [(&str, String, &str, Option<AutopilotStop>); 11] = [
        (
            "base",
            base.clone(),
            "task 1 died:\n  verify_red\n",
            Some(stop(Some("040"), Some("task 1 died:\n  verify_red"))),
        ),
        ("no change", no_change, "", Some(stop(None, None))),
        (
            "blank body",
            base.clone(),
            "\n\n",
            Some(stop(Some("040"), None)),
        ),
        (
            "one newline",
            base.clone(),
            "line\n\n",
            Some(stop(Some("040"), Some("line\n"))),
        ),
        ("bogus reason", base_stop("bogus", Some("040")), "", None),
        (
            "number change",
            base.replace("change: \"040\"", "change: 40"),
            "",
            None,
        ),
        (
            "null change",
            base.replace("change: \"040\"", "change: null"),
            "",
            None,
        ),
        (
            "no item",
            base.replace("item: stopped-item\n", ""),
            "",
            None,
        ),
        (
            "no command",
            base.replace("command: osq retry 040 1\n", ""),
            "",
            None,
        ),
        (
            "no at",
            base.replace("at: 2026-10-22T10:00:00.000Z\n", ""),
            "",
            None,
        ),
        ("unparsable", String::from("reason: ["), "", None),
    ];
    for (name, frontmatter, body, expected) in rows {
        let project_root = temp_folder(&format!("stop_{name}"));
        write_stop(&project_root, &frontmatter, body);
        assert_eq!(read_autopilot_stop(&project_root), expected, "row {name}");
    }
}

/// Proves every one of autopilot's nine stop reasons reads.
///
/// Covers: rust-storage/every-stop-reason
#[test]
fn every_stop_reason() {
    let reasons = [
        "queue_unreadable",
        "not_approved",
        "changed_since_approval",
        "rejected",
        "plan_refused",
        "planner_not_ready",
        "approve_refused",
        "halted",
        "land_stopped",
    ];
    for reason in reasons {
        let project_root = temp_folder(&format!("reason_{reason}"));
        write_stop(&project_root, &base_stop(reason, Some("040")), "");
        let record = read_autopilot_stop(&project_root).expect("the stop reads");
        assert_eq!(record.reason, reason, "reason {reason}");
    }
}

/// Proves a project without a stop file reads no stop.
///
/// Covers: rust-storage/no-stop-file
#[test]
fn no_stop_file() {
    let project_root = temp_folder("no_stop");
    fs::create_dir_all(&project_root).unwrap();
    assert_eq!(read_autopilot_stop(&project_root), None);
}

/// Proves the watch state folder hashes the project root's absolute path.
///
/// Covers: rust-storage/watch-state-folder
#[test]
fn watch_state_folder() {
    let expected = PathBuf::from(
        "/home/h/.osq/watch/84ade4b4937a142d12c5438d1dc81c2e2229362203630b653b27e43e8cc8fcde",
    );
    assert_eq!(
        watch_state_dir(Path::new("/nonexistent/osq-project"), Path::new("/home/h")),
        expected
    );
}

/// Proves a symbolic link and its target give one watch state folder.
///
/// Covers: rust-storage/watch-state-folder-through-a-symlink
#[test]
fn watch_state_folder_through_a_symlink() {
    let base = temp_folder("watch_symlink");
    fs::create_dir_all(&base).unwrap();
    let project = base.join("project");
    fs::create_dir_all(&project).unwrap();
    let link = base.join("link");
    std::os::unix::fs::symlink(&project, &link).unwrap();
    let home = Path::new("/home/h");
    assert_eq!(
        watch_state_dir(&link, home),
        watch_state_dir(&project, home)
    );
}

/// An after-land failure with the row's change, command, code and time.
fn failure(change: &str, command: &str, exit_code: i64, failed_at: &str) -> AfterLandFailure {
    AfterLandFailure {
        change: String::from(change),
        command: String::from(command),
        exit_code,
        failed_at: String::from(failed_at),
    }
}

/// Proves every row of "After-land records".
///
/// Covers: rust-storage/after-land-records
#[test]
fn after_land_records() {
    let at = "2026-10-22T10:00:00.000Z";
    let rows: [(&str, &str, Option<AfterLandFailure>); 7] = [
        (
            "record",
            r#"{"change":"030-shipped","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}"#,
            Some(failure("030-shipped", "pnpm build", 1, at)),
        ),
        (
            "string code",
            r#"{"change":"030-shipped","command":"pnpm build","exitCode":"1","failedAt":"2026-10-22T10:00:00.000Z"}"#,
            None,
        ),
        (
            "no change",
            r#"{"command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}"#,
            None,
        ),
        (
            "number command",
            r#"{"change":"030-shipped","command":5,"exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}"#,
            None,
        ),
        (
            "no time",
            r#"{"change":"030-shipped","command":"pnpm build","exitCode":1}"#,
            None,
        ),
        ("array", "[]", None),
        ("not json", "not json", None),
    ];
    for (name, text, expected) in rows {
        let project = temp_folder(&format!("after_land_{name}"));
        fs::create_dir_all(&project).unwrap();
        let home = temp_folder(&format!("after_land_{name}_home"));
        let path = watch_state_dir(&project, &home).join("after-land.json");
        write(&path, text);
        assert_eq!(
            read_after_land_failure(&project, &home),
            expected,
            "row {name}"
        );
    }
}

/// Proves a watch state folder without an after-land file reads no failure.
///
/// Covers: rust-storage/no-after-land-file
#[test]
fn no_after_land_file() {
    let project = temp_folder("no_after_land");
    fs::create_dir_all(&project).unwrap();
    let home = temp_folder("no_after_land_home");
    assert_eq!(read_after_land_failure(&project, &home), None);
}
