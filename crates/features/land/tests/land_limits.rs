//! Proves land cuts its output tails to the limits `osq.toml` sets.

mod support;

use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use sha2::{Digest, Sha256};

use support::{FIXTURE_FOLDER, LandRepo};

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

/// The `osq.toml` for an after-land command that fails with two kept lines.
const AFTER_TAIL: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "echo one; echo two; echo three; exit 3"
[limits]
cardOutputLines = 2
"#;

/// The `osq.toml` for a sync command that fails with two kept lines.
const STOP_TAIL: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
[limits]
cardOutputLines = 2
"#;

/// The `osq.toml` for a sync verify that keeps two lines of five characters.
const VERIFY_TAIL: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
[limits]
markerOutputLines = 2
markerLineChars = 5
"#;

/// The change's archived folder.
fn archive() -> String {
    format!("openspec/changes/archive/{FIXTURE_FOLDER}")
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
fn message(error: &osq_core::FeatureError) -> &str {
    match error {
        osq_core::FeatureError::Failed { message, .. } => message,
        other => panic!("expected a Failed error, got {other:?}"),
    }
}

/// Writes the archived proposal holding the row's frontmatter lines.
fn write_proposal(repo: &LandRepo, path: &std::path::Path, frontmatter: &str) {
    let proposal = format!("---\ntitle: A\n{frontmatter}---\n## Verify\n\nx\n");
    repo.write(path, &format!("{}/proposal.md", archive()), proposal);
}

/// Proves the after-land tail keeps only `limits.cardOutputLines` lines.
///
/// Covers: rust-land/after-land-tail-from-the-config
#[test]
fn after_land_tail_follows_the_config() {
    let repo = LandRepo::new("limits-after-tail");
    let _ = repo.add_fixture_change();
    repo.write(repo.checkout(), "osq.toml", AFTER_TAIL);
    let record = record_path(&repo);
    let _ = fs::remove_file(&record);

    let error = repo.run("1").expect_err("the after-land command fails");
    let commit = repo.head(repo.checkout());
    let mut expected = landed_output(&repo, &commit);
    expected.push_str(
        "After-land command failed: echo one; echo two; echo three; exit 3\ntwo\nthree\nrun osq land 001 again to retry it",
    );
    assert_eq!(message(&error), expected);
    let _ = fs::remove_file(&record);
}

/// Proves a sync stop tail keeps only `limits.cardOutputLines` lines.
///
/// Covers: rust-land/sync-stop-tail-from-the-config
#[test]
fn sync_stop_tail_follows_the_config() {
    let repo = LandRepo::new("limits-sync-stop");
    let change = repo.add_fixture_change();
    write_proposal(
        &repo,
        &change.path,
        "verify: echo one; echo two; echo three; exit 1\n",
    );
    repo.commit_all(&change.path, "replace the proposal");
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);
    repo.write(repo.checkout(), "osq.toml", STOP_TAIL);

    let error = repo.run("1").expect_err("the verify stops the sync");
    let message = message(&error);
    assert!(message.ends_with(":\ntwo\nthree"), "{message}");
}

/// Proves the sync verify tail keeps `limits.markerOutputLines` and
/// `limits.markerLineChars`.
///
/// Covers: rust-land/sync-verify-tail-from-the-config
#[test]
fn sync_verify_tail_follows_the_config() {
    let repo = LandRepo::new("limits-sync-verify");
    let change = repo.add_fixture_change();
    write_proposal(
        &repo,
        &change.path,
        "verify: echo one; echo two; echo abcdefgh\n",
    );
    repo.commit_all(&change.path, "replace the proposal");
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);
    repo.write(repo.checkout(), "osq.toml", VERIFY_TAIL);

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );
    let text = repo.read(
        &change.path,
        &format!("{}/.run/events/change.jsonl", archive()),
    );
    let events: Vec<Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).expect("the event line is JSON"))
        .collect();
    let event = &events[events.len() - 2];
    assert_eq!(event["type"], "verify_ran");
    assert_eq!(event["data"]["output"], "two\nabcde… (3 more characters)");
    assert_eq!(events.last().expect("the synced event")["type"], "synced");
}
