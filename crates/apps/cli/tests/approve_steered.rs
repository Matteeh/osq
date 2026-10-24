//! Proves a steered approval through the CLI equals TypeScript's, reaction and
//! all.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_cli::{features, run_cli};
use osq_core::{Envelope, EventKind, parse_event_line};

/// The change every case approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";
/// The seal the case writes before the human's plan edit.
const OLD_SEAL: &str = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
/// The human's uncommitted plan edit.
const EDIT: &str = "\nSteered once.\n";
/// The author the fixture's commits carry.
const AUTHOR: &str = "Osq Bot <bot@example.com>";
/// A dead task whose verify went red.
const DEAD_VERIFY_RED: (&str, &str) = ("dead/1.md", "---\nreason: verify_red\n---\nerror: one\n");
/// A dead task whose work is blocked.
const DEAD_BLOCKED: (&str, &str) = ("dead/1.md", "---\nreason: blocked\n---\n- needs a port\n");
/// A change-level verify regression.
const CHANGE_RED: (&str, &str) = (
    "regressed/change.md",
    "---\nreason: verify_red\n---\nchange verify failed\n",
);
/// Task one's done marker.
const DONE_1: (&str, &str) = ("done/1", "done\n");

/// One row of "Steered approvals equal TypeScript's".
struct Row {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// Whether the row's `osq.toml` enables git.
    git: bool,
    /// The markers the case writes.
    markers: &'static [(&'static str, &'static str)],
}

/// Every row of "Steered approvals equal TypeScript's".
const ROWS: [Row; 4] = [
    Row {
        name: "dead-001",
        git: true,
        markers: &[DEAD_VERIFY_RED],
    },
    Row {
        name: "blocked-001",
        git: true,
        markers: &[DEAD_BLOCKED],
    },
    Row {
        name: "change-001",
        git: true,
        markers: &[DONE_1, CHANGE_RED],
    },
    Row {
        name: "git-off-001",
        git: false,
        markers: &[DEAD_BLOCKED],
    },
];

/// One scratch repository and the change folder the approval writes.
struct Repo {
    /// The scratch root that holds `repo` and `worktrees`.
    root: PathBuf,
    /// The git repository under `root/repo`.
    path: PathBuf,
    /// The change folder inside the worktree or the checkout.
    change: PathBuf,
}

/// A golden split into the parts the scenario compares.
struct Golden {
    /// The outcome line followed by the approval lines.
    outcome: Vec<String>,
    /// The approval commit's subject, author and changed files.
    commit: Vec<String>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every `.run/` path and its lines.
    tree: Vec<(String, Vec<String>)>,
}

/// Proves every row of "Steered approvals equal TypeScript's".
///
/// Covers: rust-cli/steered-approvals-equal-typescript-s
#[test]
fn steered_approvals_equal_typescript() {
    for row in &ROWS {
        check_row(row);
    }
}

/// Compares one row's output, commit, record, tree and second delivery.
fn check_row(row: &Row) {
    let repo = build(row);
    let golden = golden(&repo, row.name);
    assert_eq!(
        golden.outcome[0], "outcome: output",
        "{}: outcome",
        row.name
    );
    let expected_stdout = format!("{}\n", golden.outcome[1..].join("\n"));
    let result = run_cli(&features(), &repo.path, &args(&["approve", "1"]));
    assert_eq!(result.stdout, expected_stdout, "{}: stdout", row.name);
    assert_eq!(result.stderr, "", "{}: stderr", row.name);
    assert_eq!(result.code, 0, "{}: code", row.name);
    assert_eq!(
        commit_lines(&repo, row.git),
        golden.commit,
        "{}: commit",
        row.name
    );
    assert_eq!(record_lines(&repo), golden.record, "{}: record", row.name);
    let tree = actual_tree(&repo.change);
    assert_eq!(
        tree_paths(&tree),
        tree_paths(&golden.tree),
        "{}: tree paths",
        row.name
    );
    for ((path, actual), (_, expected)) in tree.iter().zip(&golden.tree) {
        if is_jsonl(path) {
            compare_events(actual, expected, row.name, path);
        } else {
            assert_eq!(actual, expected, "{}: {path}", row.name);
        }
    }
    let first = run_state(&repo.change);
    let delivered = repo.change.join(".run").join("delivered");
    let _ = fs::remove_dir_all(&delivered);
    let _ = run_cli(&features(), &repo.path, &args(&["status"]));
    assert_eq!(
        run_state(&repo.change),
        first,
        "{}: second delivery",
        row.name
    );
}

/// Builds the golden script's repository for one row.
fn build(row: &Row) -> Repo {
    let root = scratch(&format!("steered-{}", row.name));
    let path = root.join("repo");
    copy_tree(&fixture(), &path);
    git(&path, &["init", "-q", "-b", "main"]);
    git(&path, &["config", "user.name", "Osq Tester"]);
    git(&path, &["config", "user.email", "tester@example.com"]);
    git(&path, &["config", "commit.gpgsign", "false"]);
    exclude(&path);
    write_config(&path, &root.join("worktrees"), row.git);
    git(
        &path,
        &["add", "-A", "--", ".", ":!openspec/changes/001-alpha-twice"],
    );
    git(&path, &["commit", "-q", "-m", "fixture"]);
    let checkout = path.join("openspec/changes").join(FOLDER);
    if !row.git {
        write_markers(&checkout, row.markers);
        edit(&checkout);
        return Repo {
            root,
            path,
            change: checkout,
        };
    }
    let worktree = root.join("worktrees/repo").join(FOLDER);
    fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    let target = worktree.to_string_lossy().into_owned();
    git(
        &path,
        &["worktree", "add", "-q", "-b", BRANCH, &target, "main"],
    );
    let change = worktree.join("openspec/changes").join(FOLDER);
    copy_tree(&checkout, &change);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_markers(&change, row.markers);
    git(&worktree, &["add", "-A"]);
    git(&worktree, &["commit", "-q", "-m", "osq: 001 approved"]);
    edit(&change);
    Repo { root, path, change }
}

/// Writes the old seal and each marker under a change folder's `.run/`.
fn write_markers(folder: &Path, markers: &[(&str, &str)]) {
    let run = folder.join(".run");
    fs::create_dir_all(&run).expect("the .run folder is created");
    fs::write(run.join("approved"), format!("{OLD_SEAL}\n")).expect("the old seal is written");
    for (relative, text) in markers {
        let path = run.join(relative);
        fs::create_dir_all(path.parent().expect("a marker has a parent"))
            .expect("the marker folder is created");
        fs::write(path, text).expect("the marker is written");
    }
}

/// Appends the human's uncommitted edit to task one.
fn edit(folder: &Path) {
    let path = folder.join("tasks/1.md");
    let mut text = fs::read_to_string(&path).expect("the task reads");
    text.push_str(EDIT);
    fs::write(path, text).expect("the plan edit is written");
}

/// Writes the `osq.toml` the scenario reads.
fn write_config(repo: &Path, worktrees: &Path, git_on: bool) {
    let text = format!(
        "[vcs]\nenabled = {git_on}\nauthor = \"{AUTHOR}\"\nworktreeRoot = \"{}\"\n",
        worktrees.display()
    );
    fs::write(repo.join("osq.toml"), text).expect("osq.toml is written");
}

/// Appends the settings files a repository ignores to `.git/info/exclude`.
fn exclude(repo: &Path) {
    let path = repo.join(".git/info/exclude");
    let mut text = fs::read_to_string(&path).unwrap_or_default();
    text.push_str("osq.config.mjs\nosq.toml\nnode_modules\n");
    fs::write(path, text).expect("the exclude file is written");
}

/// A golden with `<root>` replaced by the scratch root.
fn golden(repo: &Repo, case: &str) -> Golden {
    let path = fixtures()
        .join("steered-golden")
        .join(format!("{case}.txt"));
    let text = fs::read_to_string(path).expect("the golden reads");
    parse_golden(&text.replace("<root>", &repo.root.display().to_string()))
}

/// Splits a golden into its outcome, commit, record and tree sections.
fn parse_golden(text: &str) -> Golden {
    let mut golden = Golden {
        outcome: Vec::new(),
        commit: Vec::new(),
        record: Vec::new(),
        tree: Vec::new(),
    };
    let mut section = 0;
    for line in text.lines() {
        match line {
            "commit:" => section = 1,
            "record:" => section = 2,
            "tree:" => section = 3,
            _ => match section {
                0 => golden.outcome.push(line.to_owned()),
                1 => golden.commit.push(line.to_owned()),
                2 => golden.record.push(line.to_owned()),
                _ => match line.strip_prefix("--- ") {
                    Some(path) => golden.tree.push((path.to_owned(), Vec::new())),
                    None => golden
                        .tree
                        .last_mut()
                        .expect("a golden tree line follows a path")
                        .1
                        .push(line.to_owned()),
                },
            },
        }
    }
    golden
}

/// The approval commit section of a run, as the golden script writes it.
fn commit_lines(repo: &Repo, git_on: bool) -> Vec<String> {
    if !git_on {
        return vec!["none".to_owned()];
    }
    let log = git(&repo.path, &["log", "-1", "--format=%s%n%an <%ae>", BRANCH]);
    let mut parts = log.trim().lines();
    let subject = parts.next().unwrap_or_default();
    let author = parts.next().unwrap_or_default();
    if subject == "osq: 001 approved" && author == "Osq Tester <tester@example.com>" {
        return vec!["none".to_owned()];
    }
    let changed = git(
        &repo.path,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", BRANCH],
    );
    let mut lines = vec![subject.to_owned(), author.to_owned()];
    let mut entries: Vec<String> = changed
        .trim()
        .lines()
        .map(str::to_owned)
        .filter(|line| !left_out(line))
        .collect();
    entries.sort();
    lines.extend(entries);
    lines
}

/// Whether a commit line names a file the golden script leaves out.
fn left_out(line: &str) -> bool {
    let Some((_, path)) = line.split_once('\t') else {
        return false;
    };
    path.ends_with("/.run/manifest.json")
        || path.ends_with("/.run/plan.jsonl")
        || path.ends_with("/.run/events/change.jsonl")
}

/// The tree record's lines, each `at` written as `<at>`.
fn record_lines(repo: &Repo) -> Vec<String> {
    let Ok(text) = fs::read_to_string(repo.path.join(".git/osq-trees.jsonl")) else {
        return Vec::new();
    };
    text.lines()
        .filter(|line| !line.is_empty())
        .map(blank_at)
        .collect()
}

/// Writes the value of a record line's first `at` field as `<at>`.
fn blank_at(line: &str) -> String {
    let Some(start) = line.find("\"at\":\"") else {
        return line.to_owned();
    };
    let value = start + "\"at\":\"".len();
    let Some(end) = line[value..].find('"') else {
        return line.to_owned();
    };
    format!(
        "{}\"at\":\"<at>\"{}",
        &line[..start],
        &line[value + end + 1..]
    )
}

/// Every `.run/` path an approval left, with the lines the golden compares.
fn actual_tree(change: &Path) -> Vec<(String, Vec<String>)> {
    let mut files = Vec::new();
    files_under(change, &change.join(".run"), &mut files);
    files.sort();
    let mut sections = Vec::new();
    for relative in files {
        if left_out_of_tree(&relative) {
            continue;
        }
        let text = fs::read_to_string(change.join(&relative)).expect("a .run file is text");
        let lines: Vec<String> = if is_jsonl(&relative) {
            text.lines()
                .filter(|line| !line.is_empty() && !approved(line))
                .map(str::to_owned)
                .collect()
        } else {
            text.strip_suffix('\n')
                .unwrap_or(&text)
                .split('\n')
                .map(str::to_owned)
                .collect()
        };
        if !lines.is_empty() {
            sections.push((relative, lines));
        }
    }
    sections
}

/// Whether a `.run/` path is left out of the comparison.
fn left_out_of_tree(relative: &str) -> bool {
    relative == ".run/delivery.lock" || relative.starts_with(".run/delivered/")
}

/// Whether an event line is an `approved` event.
fn approved(line: &str) -> bool {
    parse_event_line(line).is_ok_and(|envelope| envelope.event.kind() == EventKind::Approved)
}

/// Whether a path names a JSON-lines event file.
fn is_jsonl(path: &str) -> bool {
    path.rsplit_once('.')
        .is_some_and(|(_, extension)| extension == "jsonl")
}

/// The paths of a tree section list.
fn tree_paths(tree: &[(String, Vec<String>)]) -> Vec<&str> {
    tree.iter().map(|(path, _)| path.as_str()).collect()
}

/// Compares two event sections through their parsed envelopes.
fn compare_events(actual: &[String], expected: &[String], case: &str, path: &str) {
    assert_eq!(actual.len(), expected.len(), "{case}: {path}: event count");
    for (actual, expected) in actual.iter().zip(expected) {
        assert_eq!(normalized(actual), normalized(expected), "{case}: {path}");
    }
}

/// One event line parsed, its timestamp written `<timestamp>`.
fn normalized(line: &str) -> Envelope {
    let mut envelope = parse_event_line(line).expect("the event line parses");
    "<timestamp>".clone_into(&mut envelope.timestamp);
    envelope
}

/// Every file under `change/.run` except the delivery cursor, by bytes.
fn run_state(change: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = Vec::new();
    files_under(change, &change.join(".run"), &mut files);
    files
        .into_iter()
        .filter(|path| !path.starts_with(".run/delivered/"))
        .map(|path| {
            let bytes = fs::read(change.join(&path)).expect("a .run file reads");
            (path, bytes)
        })
        .collect()
}

/// Adds every file under `dir` to `files`, relative to `base`.
fn files_under(base: &Path, dir: &Path, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files_under(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.push(relative);
        }
    }
}

/// Runs git in `cwd` with the golden script's dates and identity, giving stdout.
fn git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_AUTHOR_DATE", "2026-10-25T10:00:00Z")
        .env("GIT_COMMITTER_DATE", "2026-10-25T10:00:00Z")
        .env("GIT_AUTHOR_NAME", "Osq Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Osq Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("git writes text")
}

/// The command line's arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its row.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("approve_steered")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    fs::canonicalize(root).expect("the scratch root canonicalizes")
}

/// The crate's `tests/fixtures` folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// The `steered-repo` fixture every row starts from.
fn fixture() -> PathBuf {
    fixtures().join("steered-repo")
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder is read") {
        let entry = entry.expect("the folder entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}
