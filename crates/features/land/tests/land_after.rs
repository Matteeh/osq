//! Proves the after-land command, its failure record and its passing line.

mod support;

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use osq_core::FeatureError;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use support::{FIXTURE_FOLDER, LandRepo};

#[path = "../src/land/time.rs"]
mod source_time;

/// The record's file name under the project's watch state folder.
const AFTER_LAND: &str = "after-land.json";
/// The paths "Land from the branch tip" reports, in their order.
const CHANGED: [&str; 12] = [
    "openspec/changes/archive/001-alpha-orders/.run/approved",
    "openspec/changes/archive/001-alpha-orders/.run/approver",
    "openspec/changes/archive/001-alpha-orders/.run/base",
    "openspec/changes/archive/001-alpha-orders/.run/done/1",
    "openspec/changes/archive/001-alpha-orders/.run/done/2",
    "openspec/changes/archive/001-alpha-orders/.run/events/1.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/2.jsonl",
    "openspec/changes/archive/001-alpha-orders/.run/events/change.jsonl",
    "openspec/changes/archive/001-alpha-orders/proposal.md",
    "openspec/changes/archive/001-alpha-orders/specs/orders/spec.md",
    "openspec/changes/archive/001-alpha-orders/tasks.md",
    "src/one.txt",
];

/// The `osq.toml` a row without an after-land command uses.
const NO_AFTER_LAND: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
"#;

/// The `osq.toml` for a passing command that writes the checkout's `built.txt`.
const PASSING: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "printf 'built\\n' > built.txt"
"#;

/// The `osq.toml` for a command that prints two lines and exits 3.
const FAILING: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "echo one; echo two; exit 3"
"#;

/// The `osq.toml` for a command that prints more than the tail keeps.
const NOISY: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "seq 1 25; printf '\\n\\n'; exit 1"
"#;

/// The `osq.toml` for a command the one-second timeout stops.
const SLOW: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "sleep 10"
[timeouts]
verifyTimeoutSeconds = 1
"#;

/// The `osq.toml` for a command that passes and clears an older record.
const CLEARING: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "true"
"#;

/// A land repository with the fixture change and `toml` as its settings.
fn setup(name: &str, toml: &str) -> (LandRepo, PathBuf) {
    let repo = LandRepo::new(name);
    let _ = repo.add_fixture_change();
    repo.write(repo.checkout(), "osq.toml", toml);
    let record = record_path(&repo);
    let _ = fs::remove_file(&record);
    (repo, record)
}

/// The `after-land.json` path TypeScript's `watchStateDir` gives the checkout.
fn record_path(repo: &LandRepo) -> PathBuf {
    let real = fs::canonicalize(repo.checkout()).expect("the checkout resolves");
    let digest = Sha256::digest(real.to_string_lossy().as_bytes());
    let mut hash = String::with_capacity(64);
    for byte in digest {
        write!(hash, "{byte:02x}").expect("writing to a String succeeds");
    }
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join(".osq")
        .join("watch")
        .join(hash)
        .join(AFTER_LAND)
}

/// The output "Land from the branch tip" gives for a land commit.
fn landed_output(repo: &LandRepo, commit: &str) -> String {
    let mut text =
        format!("Landed {FIXTURE_FOLDER} as {commit}\nKept branch osq/{FIXTURE_FOLDER}\n");
    for path in CHANGED {
        writeln!(text, "Changed {}", repo.checkout().join(path).display())
            .expect("a string writes");
    }
    text
}

/// The message of a `Failed` land error.
fn message(error: &FeatureError) -> &str {
    match error {
        FeatureError::Failed { message, .. } => message,
        other => panic!("expected a Failed error, got {other:?}"),
    }
}

/// The failure lines for `command`, its output tail and the retry line.
fn failure_lines(command: &str, tail: &[&str]) -> Vec<String> {
    let mut lines = vec![format!("After-land command failed: {command}")];
    lines.extend(tail.iter().map(|line| (*line).to_owned()));
    lines.push("run osq land 001 again to retry it".to_owned());
    lines
}

/// The record's parsed text, proving it is one line of JSON.
fn read_record(record: &Path) -> (String, Value) {
    let text = fs::read_to_string(record).expect("the record reads");
    let value = serde_json::from_str(&text).expect("the record is JSON");
    (text, value)
}

/// Proves the row with no after-land command runs nothing and records nothing.
///
/// Covers: rust-land/after-land-outcomes
#[test]
fn after_land_unset_runs_nothing() {
    let (repo, record) = setup("after_none", NO_AFTER_LAND);
    let output = repo.run("1").expect("the land succeeds").text;
    let commit = repo.head(repo.checkout());
    assert_eq!(output, landed_output(&repo, &commit));
    assert!(!record.exists(), "no record is written");
    let _ = fs::remove_file(&record);
}

/// Proves a passing after-land command writes its file and reports the line.
///
/// Covers: rust-land/after-land-outcomes
#[test]
fn after_land_passes() {
    let (repo, record) = setup("after_passes", PASSING);
    let output = repo.run("1").expect("the land succeeds").text;
    let commit = repo.head(repo.checkout());
    let mut expected = landed_output(&repo, &commit);
    expected.push_str("After-land command passed: printf 'built\\n' > built.txt\n");
    assert_eq!(output, expected);
    assert_eq!(repo.read(repo.checkout(), "built.txt"), "built\n");
    assert!(!record.exists(), "no record is written");
    let _ = fs::remove_file(&record);
}

/// Proves a failing after-land command writes every record field and the lines.
///
/// Covers: rust-land/after-land-outcomes
#[test]
fn after_land_fails() {
    assert_timestamp_text();
    let (repo, record) = setup("after_fails", FAILING);
    let error = repo.run("1").expect_err("the after-land command fails");
    let commit = repo.head(repo.checkout());
    let mut expected = landed_output(&repo, &commit);
    expected.push_str(&failure_lines("echo one; echo two; exit 3", &["one", "two"]).join("\n"));
    assert_eq!(message(&error), expected);
    assert_eq!(repo.head(repo.checkout()), commit, "the land commit stays");

    let (text, value) = read_record(&record);
    assert_eq!(
        value,
        json!({
            "change": FIXTURE_FOLDER,
            "command": "echo one; echo two; exit 3",
            "exitCode": 3,
            "failedAt": value["failedAt"],
        })
    );
    let failed_at = value["failedAt"].as_str().expect("failedAt is text");
    assert_eq!(failed_at.len(), 24, "the timestamp is milliseconds");
    assert!(failed_at.ends_with('Z'), "the timestamp is UTC");
    assert!(text.ends_with('\n'), "the record ends with a newline");
    let _ = fs::remove_file(&record);
}

/// Proves a noisy failing command keeps only its last twenty non-blank lines.
///
/// Covers: rust-land/after-land-outcomes
#[test]
fn after_land_keeps_the_tail() {
    let (repo, record) = setup("after_tail", NOISY);
    let error = repo.run("1").expect_err("the after-land command fails");
    let commit = repo.head(repo.checkout());
    let numbers: Vec<String> = (6..=25).map(|number| number.to_string()).collect();
    let tail: Vec<&str> = numbers.iter().map(String::as_str).collect();
    let mut expected = landed_output(&repo, &commit);
    expected.push_str(&failure_lines(r"seq 1 25; printf '\n\n'; exit 1", &tail).join("\n"));
    assert_eq!(message(&error), expected);

    let (_text, value) = read_record(&record);
    assert_eq!(value["exitCode"], json!(1));
    let _ = fs::remove_file(&record);
}

/// Proves the configured timeout stops the command and records exit code 1.
///
/// Covers: rust-land/after-land-outcomes
#[test]
fn after_land_times_out() {
    let (repo, record) = setup("after_timeout", SLOW);
    let started = Instant::now();
    let error = repo.run("1").expect_err("the after-land command times out");
    let elapsed = started.elapsed();
    assert!(
        elapsed < Duration::from_secs(5),
        "the land took {elapsed:?}"
    );
    let commit = repo.head(repo.checkout());
    let mut expected = landed_output(&repo, &commit);
    expected.push_str(&failure_lines("sleep 10", &[]).join("\n"));
    assert_eq!(message(&error), expected);

    let (_text, value) = read_record(&record);
    assert_eq!(value["exitCode"], json!(1));
    let _ = fs::remove_file(&record);
}

/// Proves a passing command removes an older failure record.
///
/// Covers: rust-land/a-passing-command-clears-the-record
#[test]
fn after_land_clears_the_record() {
    let (repo, record) = setup("after_clears", CLEARING);
    fs::create_dir_all(record.parent().expect("the record has a parent"))
        .expect("the record's folders are created");
    fs::write(
        &record,
        "{\"change\":\"001-alpha-orders\",\"command\":\"false\",\"exitCode\":1,\"failedAt\":\"2026-10-01T10:00:00.000Z\"}\n",
    )
    .expect("the record is written");

    let output = repo.run("1").expect("the land succeeds").text;
    let commit = repo.head(repo.checkout());
    let mut expected = landed_output(&repo, &commit);
    expected.push_str("After-land command passed: true\n");
    assert_eq!(output, expected);
    assert!(!record.exists(), "the record is removed");
    let _ = fs::remove_file(&record);
}

/// Proves a record that cannot be removed fails the land rather than passing.
///
/// Covers: rust-land/a-passing-command-clears-the-record
#[test]
fn after_land_reports_a_record_it_cannot_clear() {
    let (repo, record) = setup("after_clear_fails", CLEARING);
    fs::create_dir_all(record.join("kept")).expect("the record's folder is created");
    fs::write(record.join("kept").join("entry"), "kept\n").expect("the entry is written");

    let error = repo.run("1").expect_err("the record cannot be removed");
    assert!(
        matches!(error, FeatureError::Failed { ref command, .. } if command == "land"),
        "the land fails with its command: {error:?}"
    );

    let _ = fs::remove_dir_all(&record);
}

/// The current time as epoch milliseconds, for the clock's bounds.
fn elapsed_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch");
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}

/// Checks the fixed UTC form across era, leap-year and month edges.
fn assert_timestamp_text() {
    let rows: [(i64, &str); 16] = [
        (-62_162_121_600_000, "0000-02-29T00:00:00.000Z"),
        (-62_162_035_200_001, "0000-02-29T23:59:59.999Z"),
        (-62_162_035_200_000, "0000-03-01T00:00:00.000Z"),
        (-62_135_596_800_000, "0001-01-01T00:00:00.000Z"),
        (-59_006_316_303_211, "0100-03-01T12:34:56.789Z"),
        (-49_539_254_400_001, "0400-02-29T23:59:59.999Z"),
        (-11_670_998_400_000, "1600-02-29T00:00:00.000Z"),
        (-1, "1969-12-31T23:59:59.999Z"),
        (0, "1970-01-01T00:00:00.000Z"),
        (951_804_428_009, "2000-02-29T06:07:08.009Z"),
        (1_709_208_000_000, "2024-02-29T12:00:00.000Z"),
        (1_735_689_599_999, "2024-12-31T23:59:59.999Z"),
        (1_735_689_600_000, "2025-01-01T00:00:00.000Z"),
        (1_792_231_200_000, "2026-10-17T10:00:00.000Z"),
        (13_574_563_200_000, "2400-02-29T00:00:00.000Z"),
        (253_402_300_799_999, "9999-12-31T23:59:59.999Z"),
    ];
    for (ms, expected) in rows {
        assert_eq!(source_time::format_utc(ms), expected, "{ms}");
    }
    let before = elapsed_ms();
    let now = source_time::now_ms();
    let after = elapsed_ms();
    assert!(before <= now && now <= after, "the clock is UTC now");
}
