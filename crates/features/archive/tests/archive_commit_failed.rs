//! Proves a failed worktree archive commit leaves TypeScript's record behind.

mod support;

#[path = "../src/excerpt.rs"]
mod source_excerpt;
#[path = "../src/regress.rs"]
mod source_regress;
#[path = "../src/time.rs"]
mod time;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use osq_kernel_vcs::VcsError;
use serde_json::{Map, Value};

use support::{copy_tree, fixture, run, scratch};

/// The fixture change every scratch repository holds.
const FOLDER: &str = "007-sample";

/// The fixture change folder relative to an `openspec` root.
const CHANGE: &str = "openspec/changes/007-sample";

/// The copied goldens.
const GOLDEN: &str = "tests/fixtures/commit-failed-golden";

/// The one golden this scenario prints.
const GOLDEN_NAME: &str = "archive-fails-007";

/// The `osq.toml` every scratch repository holds.
const VCS_TABLE: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n";

/// One scratch repository and the tree the change sits in.
struct Repo {
    /// The repository root.
    root: PathBuf,
    /// The worktree that holds the change.
    tree: PathBuf,
    /// The branch whose tip the archive commits on.
    branch: String,
}

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

/// Builds the `hook-fails` scratch repository as the golden script builds it.
fn repository(root: &Path) -> Repo {
    let repo = root.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    git(&repo, &["config", "commit.gpgsign", "false"]);
    write(&repo.join("README.md"), "fixture\n");
    write(&repo.join("osq.toml"), VCS_TABLE);
    copy_tree(
        &fixture().join("openspec/specs"),
        &repo.join("openspec/specs"),
    );
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    let tree = root.join("trees").join(FOLDER);
    fs::create_dir_all(tree.parent().expect("the tree has a parent"))
        .expect("the trees folder is created");
    let branch = format!("osq/{FOLDER}");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            &branch,
            tree.to_str().expect("the path is UTF-8"),
            "main",
        ],
    );
    copy_tree(&fixture().join(CHANGE), &tree.join(CHANGE));
    git(&tree, &["add", "-A"]);
    git(&tree, &["commit", "-q", "-m", "osq: 007 approved"]);
    Repo {
        root: repo,
        tree,
        branch,
    }
}

/// Reads the copied golden.
fn golden() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(GOLDEN)
        .join(format!("{GOLDEN_NAME}.txt"));
    fs::read_to_string(path).expect("the golden reads")
}

/// The archive folder name on a golden's first line.
fn golden_name(golden: &str) -> &str {
    golden
        .strip_prefix("name: ")
        .expect("the golden names the archive")
        .lines()
        .next()
        .expect("the name line holds a name")
}

/// The executable `pre-commit` hook that refuses every commit.
fn refusing_hook(repo: &Path) {
    let hook = repo.join(".git").join("hooks").join("pre-commit");
    write(&hook, "#!/bin/sh\necho refused by hook >&2\nexit 1\n");
    set_executable(&hook);
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

/// Every file under `dir`, relative to `base` with `/`.
fn files(base: &Path, dir: &Path, found: &mut Vec<String>) {
    for entry in fs::read_dir(dir).expect("the folder reads") {
        let entry = entry.expect("the entry reads");
        let path = entry.path();
        let relative = path
            .strip_prefix(base)
            .expect("the path is under the base")
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            files(base, &path, found);
        } else {
            found.push(relative);
        }
    }
}

/// Sorts a JSON value's object keys, as the golden script sorts them.
fn sorted(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.into_iter().map(sorted).collect()),
        Value::Object(object) => {
            let mut entries: Vec<(String, Value)> = object.into_iter().collect();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            Value::Object(
                entries
                    .into_iter()
                    .map(|(key, value)| (key, sorted(value)))
                    .collect::<Map<String, Value>>(),
            )
        }
        other => other,
    }
}

/// One event line with its timestamp replaced, written with sorted keys.
fn event_line(line: &str) -> String {
    let mut value: Value = serde_json::from_str(line).expect("the event line is JSON");
    if let Value::Object(object) = &mut value {
        if object.contains_key("timestamp") {
            object.insert(
                "timestamp".to_owned(),
                Value::String("<timestamp>".to_owned()),
            );
        }
    }
    serde_json::to_string(&sorted(value)).expect("the event line writes")
}

/// The golden's `tree:` body: every file under the archived folder's `.run`.
fn tree(folder: &Path) -> String {
    let mut paths = Vec::new();
    files(folder, &folder.join(".run"), &mut paths);
    paths.sort();
    let mut lines = Vec::new();
    for relative in paths {
        lines.push(format!("--- {relative}"));
        let text = fs::read_to_string(folder.join(&relative)).expect("the file reads");
        if Path::new(&relative)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("jsonl"))
        {
            for line in text.split('\n') {
                if !line.is_empty() {
                    lines.push(event_line(line));
                }
            }
        } else {
            lines.push(text.strip_suffix('\n').unwrap_or(&text).to_owned());
        }
    }
    lines.join("\n")
}

/// The body a golden holds, built from the archived tree, branch tip and status.
fn body(repo: &Repo, name: &str) -> String {
    let archived = repo.tree.join("openspec/changes/archive").join(name);
    let tree = tree(&archived);
    let tip = git_output(&repo.tree, &["log", "-1", "--format=%B", &repo.branch]);
    let commit = git_output(
        &repo.tree,
        &[
            "show",
            "--no-renames",
            "--name-status",
            "--format=",
            &repo.branch,
        ],
    );
    let status = git_output(
        &repo.tree,
        &["status", "--porcelain", "--untracked-files=all"],
    );
    format!("name: {name}\ntree:\n{tree}\ntip:\n{tip}commit:\n{commit}status:\n{status}")
}

/// Proves a refused archive commit records `commit_failed` and still fails.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn worktree_archive_commit_fails() {
    let root = scratch("archive-commit-failed");
    let repo = repository(&root);
    refusing_hook(&repo.root);
    let error = run(&repo.root, &["007"]).expect_err("the commit fails");
    let message = error.to_string();
    assert!(
        message.starts_with("archive failed: osq could not commit the archive of 007-sample: "),
        "the failure names the commit: {message}"
    );
    assert!(
        message.contains("refused by hook"),
        "the failure carries git's output"
    );
    let expected = golden();
    assert_eq!(
        body(&repo, golden_name(&expected)),
        expected,
        "{GOLDEN_NAME}: golden"
    );
}

/// Proves the record writes its marker and event where none existed.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn failure_record_writes_marker_and_event() {
    let root = scratch("archive-failure-record");
    let archived = root.join("openspec/changes/archive/007-sample");
    fs::create_dir_all(&archived).expect("the archived folder is created");
    source_regress::record(&archived, "refused by hook\n").expect("the record writes");
    let entries = support::tree(&archived);
    assert!(entries.contains_key(".run/regressed/change.md"));
    assert!(entries.contains_key(".run/events/change.jsonl"));
    let marker =
        fs::read_to_string(archived.join(".run/regressed/change.md")).expect("the marker reads");
    assert_eq!(
        marker,
        "---\nreason: commit_failed\n---\nrefused by hook\n\n"
    );
    let events =
        fs::read_to_string(archived.join(".run/events/change.jsonl")).expect("the event reads");
    let line = events.lines().next().expect("the event line exists");
    let value: Value = serde_json::from_str(line).expect("the event line is JSON");
    assert_eq!(
        value["data"],
        serde_json::json!({
            "task": "change",
            "reason": "commit_failed",
            "output": "refused by hook\n",
        })
    );
}

/// Proves the detail is git's output or the error's display.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn failure_detail_is_gits_output_or_the_display() {
    let failed = VcsError::Failed {
        command: "git commit".to_owned(),
        output: "refused by hook\n".to_owned(),
    };
    assert_eq!(source_regress::detail(&failed), "refused by hook\n");
    let spawned = VcsError::Spawn {
        command: "git".to_owned(),
        source: io::Error::new(io::ErrorKind::NotFound, "missing"),
    };
    assert_eq!(source_regress::detail(&spawned), spawned.to_string());
}

/// Proves the tail keeps the last lines when every line fits the character limit.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn output_tail_keeps_the_last_lines_when_each_fits() {
    let output = "alpha\nbeta\ngamma\n";
    assert_eq!(
        source_excerpt::tail_verify_output(output, 2, 400),
        "beta\ngamma",
        "the last two lines"
    );
    assert_eq!(
        source_excerpt::tail_verify_output(output, 3, 400),
        output,
        "an output within both limits is unchanged"
    );
    assert_eq!(
        source_excerpt::tail_verify_output(" \n\n", 40, 400),
        "",
        "blank output is empty"
    );
}

/// Proves the tail cuts a long line and counts the characters it dropped.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn output_tail_cuts_long_lines() {
    assert_eq!(
        source_excerpt::tail_verify_output("abcdef\nghijkl\n", 40, 3),
        "abc… (3 more characters)\nghi… (3 more characters)"
    );
    assert_eq!(
        source_excerpt::tail_verify_output("abcdef\n", 40, 6),
        "abcdef\n",
        "the character limit keeps a line exactly as long"
    );
    assert_eq!(
        source_excerpt::tail_verify_output("a\nb\nc\n", 3, 400),
        "a\nb\nc\n",
        "the line limit keeps an output exactly as long"
    );
}

/// Proves the fixed UTC form across era, leap-year and month edges.
///
/// Covers: rust-archive/worktree-archive-commit-fails
#[test]
fn utc_text_for_fixed_times() {
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
        assert_eq!(time::format_utc(ms), expected, "{ms}");
    }
    let before = elapsed_ms();
    let now = time::now_ms();
    let after = elapsed_ms();
    assert!(before <= now && now <= after, "the clock is UTC now");
}

/// The current time as epoch milliseconds, for the clock's bounds.
fn elapsed_ms() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("the clock is after the epoch");
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}
