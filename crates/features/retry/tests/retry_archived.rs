//! Proves retrying an archived worktree change matches TypeScript's goldens.

mod support;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use support::{copy_tree, dump, failed_message, fixture, run, scratch};

/// The fixture folders every scratch repository holds as archived worktrees.
const FOLDERS: [&str; 3] = ["001-land-stop", "002-stale", "003-no-marker"];

/// One row of "Archived retry equals TypeScript's".
struct Row {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// The change folder whose archive the row reads.
    folder: &'static str,
    /// The two literal retry arguments.
    args: [&'static str; 2],
    /// Whether the row's `osq.toml` enables git.
    git: bool,
}

/// Every row of "Archived retry equals TypeScript's", in the table order.
const ROWS: [Row; 6] = [
    Row {
        name: "land-stop-001",
        folder: "001-land-stop",
        args: ["1", "change"],
        git: true,
    },
    Row {
        name: "land-stop-padded-001",
        folder: "001-land-stop",
        args: ["001-land-stop", " change "],
        git: true,
    },
    Row {
        name: "land-stop-task-001",
        folder: "001-land-stop",
        args: ["1", "1"],
        git: true,
    },
    Row {
        name: "stale-002",
        folder: "002-stale",
        args: ["2", "change"],
        git: true,
    },
    Row {
        name: "no-marker-003",
        folder: "003-no-marker",
        args: ["3", "change"],
        git: true,
    },
    Row {
        name: "git-off-001",
        folder: "001-land-stop",
        args: ["1", "change"],
        git: false,
    },
];

/// Runs git in a folder, failing with both streams when it refuses.
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

/// The worktree folder of one archived fixture change.
fn worktree_path(root: &Path, folder: &str) -> PathBuf {
    root.join("trees").join(folder)
}

/// The archived change folder inside its worktree.
fn archive_path(root: &Path, folder: &str) -> PathBuf {
    worktree_path(root, folder)
        .join("openspec")
        .join("changes")
        .join("archive")
        .join(folder)
}

/// Builds the row's scratch repository as the golden script builds it.
fn repository(root: &Path, git_on: bool) -> PathBuf {
    let repo = root.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    git(&repo, &["config", "commit.gpgsign", "false"]);
    write(&repo.join("README.md"), "fixture\n");
    write(
        &repo.join("osq.toml"),
        &format!("[vcs]\nenabled = {git_on}\nauthor = \"osq <osq@example.com>\"\n"),
    );
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    for folder in FOLDERS {
        let worktree = worktree_path(root, folder);
        fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
            .expect("the trees folder is created");
        let branch = format!("osq/{folder}");
        git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                &branch,
                worktree.to_str().expect("the path is UTF-8"),
                "main",
            ],
        );
        let archive = archive_path(root, folder);
        copy_tree(&fixture("archived-project").join(folder), &archive);
        git(&worktree, &["add", "-A"]);
        git(
            &worktree,
            &["commit", "-q", "-m", &format!("osq: {folder} archived")],
        );
    }
    repo
}

/// A golden's outcome, body, tree, tip and status.
struct Golden {
    /// The golden's outcome, `output` or `failed`.
    outcome: String,
    /// The result's text, ending in a newline.
    body: String,
    /// The archived `.run` tree dump.
    tree: String,
    /// The subject of the change branch's tip.
    tip: String,
    /// The worktree's porcelain status.
    status: String,
}

/// Splits a golden as the printing script writes it.
fn parse(text: &str) -> Golden {
    let (outcome, rest) = text.split_once('\n').expect("the golden names its outcome");
    let (body, rest) = rest.split_once("tree:\n").expect("the golden has a tree");
    let (tree, rest) = rest.split_once("\ntip: ").expect("the golden has a tip");
    let (tip, status) = rest
        .split_once("\nstatus:\n")
        .expect("the golden has a status");
    Golden {
        outcome: outcome
            .strip_prefix("outcome: ")
            .expect("the outcome is labelled")
            .to_owned(),
        body: body.to_owned(),
        tree: tree.to_owned(),
        tip: tip.to_owned(),
        status: status.to_owned(),
    }
}

/// Reads one golden from the crate's copied `archived-golden` fixture.
fn golden(name: &str) -> Golden {
    let path = fixture("archived-golden").join(format!("{name}.txt"));
    parse(&fs::read_to_string(path).expect("the golden reads"))
}

/// Compares one row's result, tree, branch tip and worktree status.
fn check_row(row: &Row) {
    let root = scratch("retry_archived", row.name);
    let repo = repository(&root, row.git);
    let result = run(&repo, row.args);
    let expected = golden(row.name);
    let root_text = repo.display().to_string();
    match (expected.outcome.as_str(), result) {
        ("output", Ok(output)) => assert_eq!(output.text, expected.body, "{}: output", row.name),
        ("failed", Err(error)) => {
            let message = failed_message(error).replace(&root_text, "<root>");
            assert_eq!(
                format!("{message}\n"),
                expected.body,
                "{}: message",
                row.name
            );
        }
        (outcome, actual) => panic!("{}: expected {outcome}, got {actual:?}", row.name),
    }
    check_git(&root, row.folder, &expected, row.name);
}

/// Compares one row's archive tree, branch tip and worktree status.
fn check_git(root: &Path, folder: &str, expected: &Golden, name: &str) {
    let archive = archive_path(root, folder);
    assert_eq!(dump(&archive), expected.tree, "{name}: tree");
    let branch = format!("osq/{folder}");
    let tip = git_output(&root.join("repo"), &["log", "-1", "--format=%s", &branch]);
    assert_eq!(tip.trim_end(), expected.tip, "{name}: tip");
    let status = git_output(&worktree_path(root, folder), &["status", "--porcelain"]);
    assert_eq!(status, expected.status, "{name}: status");
}

/// Proves every row of "Archived retry equals TypeScript's".
///
/// Covers: rust-retry/archived-retry-equals-typescript-s
#[test]
fn archived_retry_equals_typescript() {
    for row in &ROWS {
        check_row(row);
    }
}

/// Proves a failed archive commit restores the files and fails with its prefix.
///
/// Covers: rust-retry/archived-retry-commit-fails
#[test]
fn archived_retry_commit_fails() {
    let root = scratch("retry_archived", "commit-fails");
    let repo = repository(&root, true);
    let hook = repo.join(".git").join("hooks").join("pre-commit");
    write(&hook, "#!/bin/sh\nexit 1\n");
    set_executable(&hook);
    let error = run(&repo, ["1", "change"]).expect_err("the commit fails");
    assert!(
        failed_message(error).starts_with("osq could not record the retry: "),
        "the failure names the retry"
    );
    let expected = golden("land-stop-task-001");
    check_git(&root, "001-land-stop", &expected, "commit-fails");
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

/// Proves an archived change of the project root is not an archived worktree.
///
/// Covers: rust-retry/archived-retry-equals-typescript-s
#[test]
fn archived_retry_ignores_the_root_archive() {
    let root = scratch("retry_archived", "root-archive");
    let repo = root.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    write(
        &repo.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    );
    let archived = repo
        .join("openspec")
        .join("changes")
        .join("archive")
        .join("004-root");
    write(
        &archived.join("proposal.md"),
        "---\nverify: true\n---\n## Goal\n",
    );
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "004-root archived"]);
    let error = run(&repo, ["4", "change"]).expect_err("the root archive is not retried");
    assert_eq!(
        failed_message(error),
        format!(
            "Spec \"4\" not found in {}/openspec/changes",
            repo.display()
        )
    );
}
