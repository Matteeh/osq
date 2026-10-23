//! Proves a retry of a failed archive commit makes the commit or puts the record back.

mod support;

#[path = "../src/retry/vcs_detail.rs"]
mod source_detail;

use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_kernel_vcs::VcsError;
use serde_json::Value;
use support::{copy_tree, dump, failed_message, fixture, run, scratch};

/// The fixture change the failed archive holds.
const FOLDER: &str = "007-sample";

/// The branch whose tip the retry commits on.
const BRANCH: &str = "osq/007-sample";

/// The failure marker inside the archived folder.
const MARKER: &str = ".run/regressed/change.md";

/// The event stream inside the archived folder.
const EVENTS: &str = ".run/events/change.jsonl";

/// The `osq.toml` every scratch repository holds.
const VCS_TABLE: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n";

/// Runs git in a folder, ignoring its output.
fn git(repo: &Path, args: &[&str]) {
    let _ = git_output(repo, args);
}

/// Runs git in a folder and gives its standard output.
fn git_output(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?}: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("git writes UTF-8")
}

/// Writes one file, creating its parent folders.
fn write(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent")).expect("the parent exists");
    fs::write(path, contents).expect("the file is written");
}

/// Makes a hook executable.
#[cfg(unix)]
fn set_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).expect("the hook is executable");
}

/// Makes a hook executable on a platform without Unix modes.
#[cfg(not(unix))]
fn set_executable(path: &Path) {
    let _ = path;
}

/// Reads one copied golden of the crate's `archive-failed` fixture.
fn golden_text(name: &str) -> String {
    fs::read_to_string(fixture("archive-failed").join(name)).expect("the golden reads")
}

/// The body between `from` and `to` in a golden.
fn section<'a>(text: &'a str, from: &str, to: Option<&str>) -> &'a str {
    let start = text.find(from).expect("the golden has the section") + from.len();
    let rest = &text[start..];
    match to {
        Some(to) => &rest[..rest.find(to).expect("the section ends")],
        None => rest,
    }
}

/// The status lines one golden holds.
fn status_lines(text: &str) -> BTreeSet<String> {
    text.lines().map(str::to_owned).collect()
}

/// One file's text from a golden's `tree:` body.
fn tree_file(body: &str, wanted: &str) -> String {
    let header = format!("--- {wanted}\n");
    let start = body.find(&header).expect("the tree holds the file") + header.len();
    let rest = &body[start..];
    let element = match rest.find("\n--- .run/") {
        Some(index) => &rest[..index],
        None => rest,
    };
    format!("{element}\n")
}

/// The archived folder of one worktree.
fn archived(root: &Path) -> PathBuf {
    root.join("openspec")
        .join("changes")
        .join("archive")
        .join(FOLDER)
}

/// Makes the repository's `pre-commit` hook refuse every commit.
fn refusing_hook(repo: &Path) {
    let hook = repo.join(".git").join("hooks").join("pre-commit");
    write(&hook, "#!/bin/sh\necho refused by hook >&2\nexit 1\n");
    set_executable(&hook);
}

/// A built failed archive: its repository, worktree and golden facts.
struct Failed {
    /// The repository root that holds the worktree.
    repo: PathBuf,
    /// The worktree that holds the archived change.
    worktree: PathBuf,
    /// The archive-fails golden's `tree:` body.
    tree: String,
    /// The archive-fails golden's `status:` lines.
    status: BTreeSet<String>,
}

/// Builds the failed archive "Failed archive commit retried" describes.
fn build(name: &str) -> Failed {
    let root = scratch("retry_archive_commit", name);
    let repo = root.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    git(&repo, &["config", "commit.gpgsign", "false"]);
    write(&repo.join("README.md"), "fixture\n");
    write(&repo.join("osq.toml"), VCS_TABLE);
    let before = fixture("archive-failed").join("before");
    copy_tree(&before.join("openspec/specs"), &repo.join("openspec/specs"));
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    let worktree = root.join("trees").join(FOLDER);
    fs::create_dir_all(worktree.parent().expect("the tree has a parent"))
        .expect("the trees folder is created");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            BRANCH,
            worktree.to_str().expect("the path is UTF-8"),
            "main",
        ],
    );
    copy_tree(
        &before.join("openspec/changes").join(FOLDER),
        &worktree.join("openspec/changes").join(FOLDER),
    );
    git(&worktree, &["add", "-A"]);
    git(&worktree, &["commit", "-q", "-m", "osq: 007 approved"]);
    fs::remove_dir_all(worktree.join("openspec")).expect("the old openspec tree is removed");
    copy_tree(
        &fixture("archive-failed").join("after/openspec"),
        &worktree.join("openspec"),
    );
    git(&worktree, &["add", "-A", "--", "openspec"]);
    let failing = golden_text("archive-fails-007.txt");
    let tree = section(&failing, "tree:\n", Some("\ntip:\n")).to_owned();
    let archived = archived(&worktree);
    for path in [MARKER, EVENTS] {
        write(&archived.join(path), &tree_file(&tree, path));
    }
    let status = status_lines(&git_output(
        &worktree,
        &["status", "--porcelain", "--untracked-files=all"],
    ));
    assert_eq!(
        status,
        status_lines(section(&failing, "status:\n", None)),
        "{name}: the failed archive's status"
    );
    Failed {
        repo,
        worktree,
        tree,
        status,
    }
}

/// Every status line the refused retry leaves, with both records staged.
fn refused_status(golden: &BTreeSet<String>) -> BTreeSet<String> {
    golden
        .iter()
        .map(|line| match line.strip_prefix("?? ") {
            Some(path) => format!("A  {path}"),
            None => line.clone(),
        })
        .collect()
}

/// Proves a `commit_failed` retry makes the archive commit.
///
/// Covers: rust-retry/failed-archive-commit-retried
#[test]
fn failed_archive_commit_retried() {
    let failed = build("retried");
    let output = run(&failed.repo, ["007", "change"]).expect("the retry commits");
    assert_eq!(
        output.text,
        "Retried 007 change (next attempt: 2)\n  Reason: commit_failed\n  Retained: .run/regressed/change.1.md\n"
    );
    let worktree_golden = golden_text("worktree-007.txt");
    let tip = git_output(&failed.repo, &["log", "-1", "--format=%B", BRANCH]);
    assert_eq!(
        tip,
        section(&worktree_golden, "tip:\n", Some("commit:\n")),
        "the archive commit message"
    );
    let expected = status_lines(&format!(
        "{}A\topenspec/changes/archive/007-sample/.run/events/change.jsonl\nA\topenspec/changes/archive/007-sample/.run/regressed/change.1.md\n",
        section(&worktree_golden, "commit:\n", Some("status:\n"))
    ));
    let shown = git_output(
        &failed.worktree,
        &["show", "--no-renames", "--name-status", "--format=", BRANCH],
    );
    assert_eq!(status_lines(&shown), expected, "the committed paths");
    assert_eq!(
        git_output(
            &failed.worktree,
            &["status", "--porcelain", "--untracked-files=all"]
        ),
        "",
        "the worktree is clean"
    );
    let archived = archived(&failed.worktree);
    let regressed: Vec<String> = fs::read_dir(archived.join(".run/regressed"))
        .expect("the regressed folder reads")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(regressed, ["change.1.md"], "only the retained marker stays");
    let marker = fs::read_to_string(archived.join(".run/regressed/change.1.md"))
        .expect("the retained marker reads");
    assert_eq!(
        marker,
        tree_file(&failed.tree, MARKER),
        "the retained marker is the failure's"
    );
    let events = fs::read_to_string(archived.join(EVENTS)).expect("the event stream reads");
    let mut lines = events.lines();
    let regressed: Value = serde_json::from_str(lines.next().expect("the regressed line")).unwrap();
    assert_eq!(regressed["type"], "regressed", "the failure's line stays");
    let retry: Value = serde_json::from_str(lines.next().expect("the retry line")).unwrap();
    assert_eq!(retry["type"], "retry");
    assert_eq!(
        retry["data"],
        serde_json::json!({"attempt": 2, "reason": "commit_failed", "target": "change"})
    );
    assert!(lines.next().is_none(), "no other event is written");
}

/// Proves a refused archive commit puts the record back and fails.
///
/// Covers: rust-retry/failed-archive-commit-retry-refused
#[test]
fn failed_archive_commit_retry_refused() {
    let failed = build("refused");
    refusing_hook(&failed.repo);
    let error = run(&failed.repo, ["007", "change"]).expect_err("the commit fails");
    let message = failed_message(error);
    assert!(
        message.starts_with("osq could not commit the archive: "),
        "the failure names the archive: {message}"
    );
    assert!(
        message.contains("refused by hook"),
        "the failure carries git's output"
    );
    let archived = archived(&failed.worktree);
    assert_eq!(dump(&archived), failed.tree, "the record is put back");
    let tip = git_output(&failed.repo, &["log", "-1", "--format=%s", BRANCH]);
    assert_eq!(tip.trim_end(), "osq: 007 approved", "the tip is unchanged");
    let status = status_lines(&git_output(
        &failed.worktree,
        &["status", "--porcelain", "--untracked-files=all"],
    ));
    assert_eq!(
        status,
        refused_status(&failed.status),
        "the failed archive's staging is kept"
    );
}

/// Proves a refused retry removes an event stream the folder lacked.
///
/// Covers: rust-retry/failed-archive-commit-retry-refused
#[test]
fn refused_archive_retry_removes_an_absent_event_stream() {
    let failed = build("absent-events");
    let archived = archived(&failed.worktree);
    fs::remove_file(archived.join(EVENTS)).expect("the fixture events are removed");
    refusing_hook(&failed.repo);
    let message =
        failed_message(run(&failed.repo, ["007", "change"]).expect_err("the commit fails"));
    assert!(message.starts_with("osq could not commit the archive: "));
    assert!(
        !archived.join(EVENTS).exists(),
        "the event stream was absent before the retry"
    );
    assert!(
        archived.join(".run/regressed/change.md").exists(),
        "the failure marker is put back"
    );
}

/// Proves a record that cannot be written reports the path it refused.
///
/// Covers: rust-retry/failed-archive-commit-retry-refused
#[test]
fn refused_archive_retry_reports_a_record_that_cannot_be_written() {
    let failed = build("write-error");
    let old = failed.worktree.join("openspec/changes").join(FOLDER);
    write(&old, "not a folder\n");
    let message =
        failed_message(run(&failed.repo, ["007", "change"]).expect_err("the write fails"));
    assert!(
        message.starts_with("cannot write "),
        "the failure names the path: {message}"
    );
}

/// Proves the recorded detail is git's output or the error's display.
///
/// Covers: rust-retry/failed-archive-commit-retry-refused
#[test]
fn failure_detail_is_gits_output_or_the_display() {
    let failed = VcsError::Failed {
        command: "git commit".to_owned(),
        output: "refused by hook\n".to_owned(),
    };
    assert_eq!(source_detail::detail(&failed), "refused by hook\n");
    let spawned = VcsError::Spawn {
        command: "git".to_owned(),
        source: io::Error::new(io::ErrorKind::NotFound, "missing"),
    };
    assert_eq!(source_detail::detail(&spawned), spawned.to_string());
}

/// Proves the archive commit leaves a path outside the archive alone.
///
/// Covers: rust-retry/failed-archive-commit-retried
#[test]
fn archive_commit_ignores_paths_outside_the_archive() {
    let failed = build("outside");
    write(&failed.worktree.join("README.md"), "changed\n");
    run(&failed.repo, ["007", "change"]).expect("the retry commits");
    let shown = git_output(
        &failed.worktree,
        &["show", "--no-renames", "--name-status", "--format=", BRANCH],
    );
    assert!(
        !shown.contains("README.md"),
        "the archive commit leaves the file alone: {shown}"
    );
    assert_eq!(
        git_output(
            &failed.worktree,
            &["status", "--porcelain", "--untracked-files=all"]
        ),
        " M README.md\n",
        "the file stays modified"
    );
}
