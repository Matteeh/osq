//! Proves the proposal verify and check a sync runs on the merged tree.

mod support;

use std::fs;
use std::path::Path;

use serde_json::Value;
use support::{ChangeTree, FIXTURE_FOLDER, LandRepo};

/// The change's archived folder.
fn archive() -> String {
    format!("openspec/changes/archive/{FIXTURE_FOLDER}")
}

/// The change stream inside the archived folder.
fn events() -> String {
    format!("{}/.run/events/change.jsonl", archive())
}

/// The row's proposal, with its frontmatter lines.
fn proposal(frontmatter: &str) -> String {
    format!("---\ntitle: A\n{frontmatter}---\n## Verify\n\nx\n")
}

/// The fixture change's files, with the row's proposal in place.
fn fixture_files(frontmatter: &str) -> Vec<(String, Vec<u8>)> {
    let root = support::fixture(&format!("land-change/{FIXTURE_FOLDER}"));
    let mut files = Vec::new();
    collect(&root, &root, &mut files);
    files.retain(|(path, _)| path != "proposal.md");
    files.push(("proposal.md".to_owned(), proposal(frontmatter).into_bytes()));
    files
}

/// Collects the files under `folder`, relative to `base`.
fn collect(base: &Path, folder: &Path, files: &mut Vec<(String, Vec<u8>)>) {
    for entry in fs::read_dir(folder).expect("the fixture folder reads") {
        let entry = entry.expect("the fixture entry reads");
        let path = entry.path();
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the fixture file sits under the base")
                .to_string_lossy()
                .replace('\\', "/");
            files.push((relative, fs::read(&path).expect("the fixture file reads")));
        }
    }
}

/// A land repository holding the fixture change with the row's proposal,
/// after `main` gained a commit that adds `other.txt`.
fn land_repo(name: &str, frontmatter: &str) -> (LandRepo, ChangeTree) {
    let repo = LandRepo::new(name);
    let files = fixture_files(frontmatter);
    let refs: Vec<(&str, &[u8])> = files
        .iter()
        .map(|(path, bytes)| (path.as_str(), bytes.as_slice()))
        .collect();
    let change = repo.add_change_with(FIXTURE_FOLDER, &refs);
    repo.write(repo.checkout(), "other.txt", "other\n");
    repo.commit(repo.checkout(), "main adds other", &["other.txt"]);
    (repo, change)
}

/// The events the change's branch tip holds.
fn branch_events(repo: &LandRepo, change: &ChangeTree) -> Vec<Value> {
    let branch = format!("osq/{FIXTURE_FOLDER}");
    let text = repo.git(&change.path, &["show", &format!("{branch}:{}", events())]);
    text.lines()
        .map(|line| serde_json::from_str(line).expect("the branch's event line is JSON"))
        .collect()
}

/// The commit the change's branch names.
fn branch(repo: &LandRepo) -> String {
    repo.branch_head(&format!("osq/{FIXTURE_FOLDER}"))
}

/// The event `event`'s data, with its duration removed.
fn without_duration(event: &Value) -> Value {
    let mut data = event["data"].clone();
    data.as_object_mut()
        .expect("the event's data is an object")
        .remove("duration");
    data
}

/// Proves the first row of "Sync verify outcomes": a passing verify keeps its log.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_verify_passes_and_logs() {
    let (repo, change) = land_repo("sync-verify-pass", "verify: echo ok\n");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let event = &events[events.len() - 2];
    assert_eq!(event["type"], "verify_ran");
    let data = event["data"].as_object().expect("the data is an object");
    assert_eq!(data.len(), 5, "{event}");
    assert!(
        data.keys()
            .all(|key| ["command", "exitCode", "duration", "log", "output"].contains(&key.as_str())),
        "{event}"
    );
    assert!(event["data"]["duration"].is_u64(), "{event}");
    assert_eq!(
        without_duration(event),
        serde_json::json!({
            "command": "echo ok",
            "exitCode": 0,
            "log": ".run/logs/change-1.log",
            "output": "ok\n",
        })
    );
    assert_eq!(events.last().expect("the synced event")["type"], "synced");
    assert_eq!(
        repo.read(
            &change.path,
            &format!("{}/.run/logs/change-1.log", archive())
        ),
        "ok\n"
    );
    assert_eq!(
        repo.read(&change.path, &format!("{}/.run/logs/.gitignore", archive())),
        "*\n"
    );
    let paths = repo.git(
        &change.path,
        &["ls-tree", "-r", "--name-only", &branch(&repo)],
    );
    assert!(
        !paths
            .lines()
            .any(|path| path.starts_with(&format!("{}/.run/logs/", archive()))),
        "{paths}"
    );
}

/// Proves the next free log number counts only `change-<digits>.log` files.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_uses_the_next_free_log_number() {
    let (repo, change) = land_repo("sync-verify-log-number", "verify: echo ok\n");
    for name in [
        "change-1.log",
        "change-2.log",
        "change-.log",
        "change-x.log",
    ] {
        repo.write(
            &change.path,
            &format!("{}/.run/logs/{name}", archive()),
            "old\n",
        );
    }
    repo.commit_all(&change.path, "branch seeds its logs");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let event = &events[events.len() - 2];
    assert_eq!(event["type"], "verify_ran");
    assert_eq!(event["data"]["log"], ".run/logs/change-3.log");
    assert_eq!(
        repo.read(
            &change.path,
            &format!("{}/.run/logs/change-3.log", archive())
        ),
        "ok\n"
    );
}

/// Proves the second row of "Sync verify outcomes": a long output keeps its last lines.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_keeps_the_last_forty_lines() {
    let (repo, change) = land_repo("sync-verify-lines", "verify: seq 1 45\n");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let event = &events[events.len() - 2];
    assert_eq!(event["type"], "verify_ran");
    let expected = (6..=45)
        .map(|line| line.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(event["data"]["output"], expected);
    assert_eq!(events.last().expect("the synced event")["type"], "synced");
}

/// Proves the third row of "Sync verify outcomes": an over-long line is cut.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_cuts_an_over_long_line() {
    let (repo, change) = land_repo("sync-verify-chars", "verify: printf '%0401d' 0; echo\n");

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let event = &events[events.len() - 2];
    assert_eq!(event["type"], "verify_ran");
    let expected = format!("{}… (1 more characters)", "0".repeat(400));
    assert_eq!(event["data"]["output"], expected);
    assert_eq!(events.last().expect("the synced event")["type"], "synced");
}

/// Proves the fourth row of "Sync verify outcomes": the check runs after the verify.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_runs_the_check_after_the_verify() {
    let (repo, change) = land_repo(
        "sync-verify-check-pass",
        "verify: \"true\"\ncheck: echo smoke\n",
    );

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let start = events.len() - 3;
    assert_eq!(events[start]["type"], "verify_ran");
    assert_eq!(events[start]["data"]["command"], "true");
    assert!(
        events[start]["data"].get("output").is_none(),
        "{}",
        events[start]
    );
    assert_eq!(events[start + 1]["type"], "verify_ran");
    assert_eq!(events[start + 1]["data"]["command"], "echo smoke");
    assert_eq!(events[start + 1]["data"]["output"], "smoke\n");
    assert_eq!(events[start + 2]["type"], "synced");
}

/// Proves the fifth row of "Sync verify outcomes": a red verify stops recorded.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_red_verify_stops_recorded() {
    let (repo, change) = land_repo("sync-verify-red", "verify: echo broken; exit 1\n");
    let before = repo.read(&change.path, &events());

    let error = repo.run("1").expect_err("the land stops");
    assert_eq!(
        error.to_string(),
        "land failed: 001-alpha-orders: verify failed on osq/001-alpha-orders merged with main:\nbroken"
    );

    let text = repo.git(
        &change.path,
        &["show", &format!("{}:{}", branch(&repo), events())],
    );
    assert!(text.starts_with(&before), "the earlier events are kept");
    let added = &text[before.len()..];
    assert_eq!(added.lines().count(), 1, "{added}");
    let event: Value = serde_json::from_str(added.trim()).expect("the regressed event is JSON");
    assert_eq!(event["type"], "regressed");
    assert_eq!(event["data"]["reason"], "sync_verify_red");
}

/// Proves the sixth row of "Sync verify outcomes": a red check stops recorded.
///
/// Covers: rust-land/sync-verify-outcomes
#[test]
fn verify_outcomes_red_check_stops_recorded() {
    let (repo, change) = land_repo(
        "sync-verify-check-red",
        "verify: true\ncheck: echo smoke failed; exit 1\n",
    );
    let before = repo.read(&change.path, &events());

    let error = repo.run("1").expect_err("the land stops");
    assert_eq!(
        error.to_string(),
        "land failed: 001-alpha-orders: check failed on osq/001-alpha-orders merged with main:\nsmoke failed"
    );

    let text = repo.git(
        &change.path,
        &["show", &format!("{}:{}", branch(&repo), events())],
    );
    assert!(text.starts_with(&before), "the earlier events are kept");
    let added = &text[before.len()..];
    assert_eq!(added.lines().count(), 1, "{added}");
    let event: Value = serde_json::from_str(added.trim()).expect("the regressed event is JSON");
    assert_eq!(event["type"], "regressed");
    assert_eq!(event["data"]["reason"], "sync_verify_red");
    assert!(!added.contains("\"verify_ran\""), "{added}");
}
