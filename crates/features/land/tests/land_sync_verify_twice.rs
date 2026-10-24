//! Proves a failed sync verify runs once more before it stops the change.

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
fn land_repo(name: &str, frontmatter: impl FnOnce(&Path) -> String) -> (LandRepo, ChangeTree) {
    let repo = LandRepo::new(name);
    let files = fixture_files(&frontmatter(repo.scratch()));
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

/// The marker path the row's verify command reads and writes.
fn marker(scratch: &Path) -> String {
    scratch
        .join("verify-marker")
        .to_str()
        .expect("the marker path is text")
        .to_owned()
}

/// Proves the first row of "Sync verify runs twice": the second run lands and
/// both runs are recorded.
///
/// Covers: rust-land/sync-verify-runs-twice
#[test]
fn sync_verify_runs_twice_second_run_lands() {
    let (repo, change) = land_repo("sync-verify-twice-pass", |scratch| {
        format!(
            "verify: if [ -e '{}' ]; then echo second; else touch '{}'; echo first; exit 1; fi\n",
            marker(scratch),
            marker(scratch)
        )
    });

    let output = repo.run("1").expect("the land succeeds").text;
    assert!(
        output.starts_with("Landed 001-alpha-orders as "),
        "{output}"
    );

    let events = branch_events(&repo, &change);
    let start = events.len() - 3;
    assert_eq!(events[start]["type"], "verify_ran");
    assert_eq!(events[start]["data"]["exitCode"], 1);
    assert_eq!(events[start]["data"]["log"], ".run/logs/change-1.log");
    assert_eq!(events[start]["data"]["output"], "first\n");
    assert_eq!(events[start + 1]["type"], "verify_ran");
    assert_eq!(events[start + 1]["data"]["exitCode"], 0);
    assert_eq!(events[start + 1]["data"]["log"], ".run/logs/change-2.log");
    assert_eq!(events[start + 1]["data"]["output"], "second\n");
    assert_eq!(events[start + 2]["type"], "synced");
    assert_eq!(
        repo.read(
            &change.path,
            &format!("{}/.run/logs/change-1.log", archive())
        ),
        "first\n"
    );
    assert_eq!(
        repo.read(
            &change.path,
            &format!("{}/.run/logs/change-2.log", archive())
        ),
        "second\n"
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

/// Proves the second row of "Sync verify runs twice": both runs fail, so the
/// stop carries the second run's output.
///
/// Covers: rust-land/sync-verify-runs-twice
#[test]
fn sync_verify_runs_twice_both_runs_fail() {
    let (repo, change) = land_repo("sync-verify-twice-red", |scratch| {
        format!(
            "verify: if [ -e '{}' ]; then echo run 2; exit 1; else touch '{}'; echo run 1; exit 1; fi\n",
            marker(scratch),
            marker(scratch)
        )
    });
    let before = repo.read(&change.path, &events());

    let error = repo.run("1").expect_err("the land stops");
    assert_eq!(
        error.to_string(),
        "land failed: 001-alpha-orders: verify failed on osq/001-alpha-orders merged with main:\nrun 2"
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
