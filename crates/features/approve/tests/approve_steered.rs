//! Proves a steered worktree approval and the refusals before it writes.

mod worktree_support;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::change_folder_seal;
use serde_json::Value;

use worktree_support::{Repo, approve, branches, build, git, record_lines};

/// The change every row approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";
/// The seal the case writes before the human's plan edit.
const OLD_SEAL: &str = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
/// The human's uncommitted plan edit.
const EDIT: &str = "\nSteered once.\n";
/// A dead task whose verify went red.
const DEAD_VERIFY_RED: (&str, &str) = ("dead/1.md", "---\nreason: verify_red\n---\nerror: one\n");
/// A dead task whose work is blocked.
const DEAD_BLOCKED: (&str, &str) = ("dead/1.md", "---\nreason: blocked\n---\n- needs a port\n");
/// A change-level verify regression.
const CHANGE_RED: (&str, &str) = (
    "regressed/change.md",
    "---\nreason: verify_red\n---\nchange verify failed\n",
);
/// A change-level sync conflict.
const CHANGE_CONFLICT: (&str, &str) = (
    "regressed/change.md",
    "---\nreason: sync_conflict\n---\nchange verify failed\n",
);
/// Task one's done marker.
const DONE_1: (&str, &str) = ("done/1", "done\n");
/// Task one's running lock.
const RUNNING_1: (&str, &str) = ("running/1.pid", "{\"pid\":999999,\"startedAt\":0}\n");

/// One success row: its golden's case, markers and event targets.
type Row = (
    &'static str,
    &'static [(&'static str, &'static str)],
    &'static [&'static str],
);

/// One golden split into the parts the scenario compares.
struct Golden {
    /// The outcome line followed by the message or approval lines.
    outcome: Vec<String>,
    /// The approval commit's subject, author and changed files.
    commit: Vec<String>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every `.run/` file after TypeScript's approval and retry.
    tree: Vec<String>,
}

/// Proves every row of "Steered worktree approvals".
///
/// Covers: rust-approve/steered-worktree-approvals
#[test]
fn steered_worktree_approvals() {
    let rows: [Row; 3] = [
        ("dead-001", &[DEAD_VERIFY_RED], &["1"]),
        ("blocked-001", &[DEAD_BLOCKED], &["1"]),
        ("change-001", &[DONE_1, CHANGE_RED], &["change"]),
    ];
    for (case, markers, targets) in rows {
        let name = format!("steered-approvals-{case}");
        let repo = steered_repo(&name, markers, true);
        let folder = repo.worktree_folder(FOLDER);
        let before = run_tree(&folder);
        let result = approve(&repo.path, &["1"]).unwrap_or_else(|error| panic!("{case}: {error}"));
        let golden = golden(&repo, case);
        assert_eq!(result.text, outcome_text(&golden), "{case}: approval lines");
        assert_eq!(commit_lines(&repo), golden.commit, "{case}: commit");
        assert_eq!(record_lines(&repo), golden.record, "{case}: record");
        let seal = approved_seal(&golden);
        assert_eq!(
            fs::read_to_string(folder.join(".run/approved")).expect("the seal reads"),
            format!("{seal}\n"),
            "{case}: seal"
        );
        check_event(&folder, &seal, targets, case);
        kept(&before, &run_tree(&folder), case);
    }
}

/// Proves every row of "Steered worktree refusals".
///
/// Covers: rust-approve/steered-worktree-refusals
#[test]
fn steered_worktree_refusals() {
    let running = steered_repo(
        "steered-refusals-running-001",
        &[CHANGE_RED, RUNNING_1],
        true,
    );
    let message = golden_outcome(&running, "running-001");
    check_refusal(&running, &message, "running-001");

    let failing = steered_repo("steered-refusals-commit-fails-001", &[DEAD_BLOCKED], true);
    lock_index(&failing);
    check_commit_failure(&failing);

    let branch = steered_repo("steered-refusals-default-branch", &[CHANGE_CONFLICT], true);
    check_refusal(
        &branch,
        "Change 001-alpha-twice needs steering: change conflict (sync_conflict). \
         Rust approve does not approve default-branch steering yet.",
        "default-branch",
    );

    let checkout = steered_repo("steered-refusals-checkout", &[DEAD_BLOCKED], false);
    check_refusal(
        &checkout,
        "Change 001-alpha-twice needs steering: task 1 blocked (blocked). \
         Rust approve steers a change with git on only in its worktree.",
        "checkout",
    );

    let done = steered_repo("steered-refusals-done-dead", &[DONE_1, DEAD_BLOCKED], true);
    check_refusal(
        &done,
        "branch osq/001-alpha-twice already exists",
        "done-dead",
    );

    let authorless = steered_repo("steered-refusals-no-author", &[DEAD_BLOCKED], true);
    fs::write(authorless.path.join("osq.toml"), "[vcs]\nenabled = true\n")
        .expect("osq.toml is written");
    check_refusal(
        &authorless,
        "vcs.author is required when vcs.enabled is true",
        "no-author",
    );
}

/// Proves a failed commit whose seal already landed is not undone.
///
/// Covers: rust-approve/steered-worktree-approvals
#[test]
fn commit_that_landed_is_kept() {
    let repo = steered_repo("steered-approvals-landed", &[DEAD_BLOCKED], true);
    let folder = repo.worktree_folder(FOLDER);
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let seal = change_folder_seal(&folder)
        .expect("the change folder seals")
        .as_str()
        .to_owned();
    fs::write(folder.join(".run/approved"), format!("{seal}\n"))
        .expect("the landed seal is written");
    git(&worktree, &["add", "-A"]);
    git(&worktree, &["commit", "-q", "-m", "osq: 001 approved"]);
    fs::write(folder.join(".run/approved"), format!("{OLD_SEAL}\n"))
        .expect("the old seal is put back");
    lock_index(&repo);
    let result = approve(&repo.path, &["1"]).expect("the landed commit is kept");
    assert!(
        result.text.starts_with("Approved 001 (001-alpha-twice)\n"),
        "the approval prints: {}",
        result.text
    );
    assert_eq!(
        fs::read_to_string(folder.join(".run/approved")).expect("the seal reads"),
        format!("{seal}\n"),
        "the new seal stays"
    );
    assert!(
        folder.join(".run/events/change.jsonl").exists(),
        "the event stays"
    );
}

/// Builds the golden script's repository, with or without its worktree.
fn steered_repo(name: &str, markers: &[(&str, &str)], worktree: bool) -> Repo {
    let repo = build(name, &[]);
    let checkout = repo.path.join("openspec/changes").join(FOLDER);
    if !worktree {
        write_markers(&checkout, markers);
        edit(&checkout);
        return repo;
    }
    let target = repo.root.join("worktrees/repo").join(FOLDER);
    fs::create_dir_all(target.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    let target_text = target.to_string_lossy().into_owned();
    git(
        &repo.path,
        &["worktree", "add", "-q", "-b", BRANCH, &target_text, "main"],
    );
    let folder = target.join("openspec/changes").join(FOLDER);
    copy_tree(&checkout, &folder);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_markers(&folder, markers);
    git(&target, &["add", "-A"]);
    git(&target, &["commit", "-q", "-m", "osq: 001 approved"]);
    edit(&folder);
    repo
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

/// Locks the worktree's index so its approval commit fails.
fn lock_index(repo: &Repo) {
    let lock = repo
        .path
        .join(".git/worktrees")
        .join(FOLDER)
        .join("index.lock");
    fs::write(lock, "").expect("the index lock is written");
}

/// Checks a refusal kept every branch, record line and `.run/` file.
fn check_refusal(repo: &Repo, message: &str, name: &str) {
    let folder = change_folder(repo);
    let before = snapshot(repo, &folder);
    let error = approve(&repo.path, &["1"]).expect_err("the row is refused");
    assert_eq!(
        error.to_string(),
        format!("approve failed: {message}"),
        "{name}: message"
    );
    assert_eq!(snapshot(repo, &folder), before, "{name}: no write");
}

/// Checks a failed commit's message, seal rollback and untouched record.
fn check_commit_failure(repo: &Repo) {
    let folder = change_folder(repo);
    let before = snapshot(repo, &folder);
    let error = approve(&repo.path, &["1"]).expect_err("the commit is refused");
    let actual = error
        .to_string()
        .strip_prefix("approve failed: ")
        .expect("the failure names approve")
        .to_owned();
    let golden = golden_outcome(repo, "commit-fails-001");
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let prefix = format!("the approved commit failed in {}: ", worktree.display());
    let suffix = ". The approval seal is undone and the plan edits are kept; \
                  run osq approve 001 again.";
    let expected_git = golden
        .strip_prefix(&prefix)
        .and_then(|message| message.strip_suffix(suffix))
        .expect("the golden names the worktree's failed commit");
    let actual_git = actual
        .strip_prefix(&prefix)
        .and_then(|message| message.strip_suffix(suffix))
        .expect("the failure names the worktree's failed commit");
    assert!(
        actual_git.contains(expected_git),
        "commit-fails-001: git message: {actual_git}"
    );
    assert_eq!(
        snapshot(repo, &folder),
        before,
        "commit-fails-001: no write"
    );
}

/// One repository state a refusal must leave unchanged.
#[derive(Debug, PartialEq, Eq)]
struct State {
    /// Every `osq/` branch name and its tip.
    branches: Vec<(String, String)>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every file under the change folder's `.run/`.
    run: BTreeMap<String, Vec<u8>>,
}

/// The branches, tree record and `.run/` files of one repository.
fn snapshot(repo: &Repo, folder: &Path) -> State {
    State {
        branches: branches(&repo.path)
            .into_iter()
            .map(|branch| {
                let tip = git(&repo.path, &["rev-parse", &branch]).trim().to_owned();
                (branch, tip)
            })
            .collect(),
        record: record_lines(repo),
        run: run_tree(folder),
    }
}

/// The change folder in the repository's osq worktree, or its checkout.
fn change_folder(repo: &Repo) -> PathBuf {
    let worktree = repo.worktree_folder(FOLDER);
    if worktree.exists() {
        worktree
    } else {
        repo.path.join("openspec/changes").join(FOLDER)
    }
}

/// Every file under one change folder's `.run/`, keyed from the change folder.
fn run_tree(folder: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = BTreeMap::new();
    collect(folder, &folder.join(".run"), &mut files);
    files
}

/// Adds every file under `dir` to `files`, relative to `base`.
fn collect(base: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the change folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, fs::read(&path).expect("the file reads"));
        }
    }
}

/// Asserts every preexisting file other than the seal keeps its bytes.
fn kept(before: &BTreeMap<String, Vec<u8>>, after: &BTreeMap<String, Vec<u8>>, name: &str) {
    for (relative, bytes) in before {
        if relative != ".run/approved" {
            assert_eq!(after.get(relative), Some(bytes), "{name}: {relative}");
        }
    }
}

/// Asserts the one `approved` event names the seal and the row's targets.
fn check_event(folder: &Path, seal: &str, targets: &[&str], name: &str) {
    let text = fs::read_to_string(folder.join(".run/events/change.jsonl"))
        .unwrap_or_else(|error| panic!("{name}: event: {error}"));
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 1, "{name}: one event");
    let value: Value =
        serde_json::from_str(lines[0]).unwrap_or_else(|error| panic!("{name}: {error}"));
    assert_eq!(value["type"], "approved", "{name}: type");
    assert_eq!(value["data"]["hash"], seal, "{name}: hash");
    let found: Vec<&str> = value["data"]["targets"]
        .as_array()
        .unwrap_or_else(|| panic!("{name}: targets"))
        .iter()
        .map(|value| value.as_str().unwrap_or_default())
        .collect();
    assert_eq!(found, targets, "{name}: targets");
}

/// The golden script's commit section, without the event and Rust-absent files.
fn commit_lines(repo: &Repo) -> Vec<String> {
    let tip = git(&repo.path, &["rev-parse", BRANCH]).trim().to_owned();
    let log = git(&repo.path, &["log", "-1", "--format=%s%n%an <%ae>", &tip]);
    let mut lines: Vec<String> = log.trim().lines().map(str::to_owned).collect();
    let changed = git(
        &repo.path,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", &tip],
    );
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

/// A steered golden, with `<root>` replaced by the repository's scratch root.
fn golden(repo: &Repo, case: &str) -> Golden {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/steered-golden")
        .join(format!("{case}.txt"));
    let text = fs::read_to_string(path).expect("the golden reads");
    parse_golden(&text.replace("<root>", &repo.root.display().to_string()))
}

/// A golden's failure message, with `<root>` replaced by the scratch root.
fn golden_outcome(repo: &Repo, case: &str) -> String {
    golden(repo, case).outcome[1..].join("\n")
}

/// The approval lines a successful golden carries.
fn outcome_text(golden: &Golden) -> String {
    format!("{}\n", golden.outcome[1..].join("\n"))
}

/// The seal named in a golden's `.run/approved` section.
fn approved_seal(golden: &Golden) -> String {
    let index = golden
        .tree
        .iter()
        .position(|line| line == "--- .run/approved")
        .expect("the golden holds the seal");
    golden.tree[index + 1].clone()
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
                _ => golden.tree.push(line.to_owned()),
            },
        }
    }
    golden
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
