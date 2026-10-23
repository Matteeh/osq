//! Proves retrying an active change in its osq worktree matches TypeScript's.

mod support;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_kernel_storage::change_folder_seal;
use support::{copy_tree, dump, failed_message, fixture, run, scratch, tree};

/// The fixture folders every scratch repository holds as active worktrees.
const FOLDERS: [&str; 4] = ["001-dead", "002-change", "003-recert", "004-plan-edits"];

/// The `tasks.md` every scratch repository's `004-plan-edits` holds.
const TASKS: &str = "# Tasks\n\n- [ ] 1. Dead task\n";

/// The author every scratch repository's commits carry.
const AUTHOR: &str = "osq <osq@example.com>";

/// One edit a row makes in its worktree before retrying.
#[derive(Clone, Copy)]
enum Edit {
    /// Ticks `tasks.md`, appends to `proposal.md` and writes `notes.md`.
    PlanEdits,
    /// Ticks `tasks.md` and writes a `.run` file.
    RunFile,
}

/// One row of "Active worktree retry equals TypeScript's".
struct Row {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// The change folder the row retries.
    folder: &'static str,
    /// The two literal retry arguments.
    args: [&'static str; 2],
    /// Whether the row's `osq.toml` enables git.
    git: bool,
    /// The edit the row makes in its worktree, when it makes one.
    edit: Option<Edit>,
    /// Whether the row also writes a draft copy in the checkout.
    draft: bool,
}

/// Every row of "Active worktree retry equals TypeScript's".
const ROWS: [Row; 7] = [
    Row {
        name: "dead-001",
        folder: "001-dead",
        args: ["1", "1"],
        git: true,
        edit: None,
        draft: false,
    },
    Row {
        name: "change-002",
        folder: "002-change",
        args: ["2", "change"],
        git: true,
        edit: None,
        draft: false,
    },
    Row {
        name: "recert-003",
        folder: "003-recert",
        args: ["3", "1"],
        git: true,
        edit: None,
        draft: false,
    },
    Row {
        name: "plan-edits-004",
        folder: "004-plan-edits",
        args: ["4", "1"],
        git: true,
        edit: Some(Edit::PlanEdits),
        draft: false,
    },
    Row {
        name: "tasks-only-004",
        folder: "004-plan-edits",
        args: ["4", "1"],
        git: true,
        edit: Some(Edit::RunFile),
        draft: false,
    },
    Row {
        name: "draft-001",
        folder: "001-dead",
        args: ["1", "1"],
        git: true,
        edit: None,
        draft: true,
    },
    Row {
        name: "git-off-001",
        folder: "001-dead",
        args: ["1", "1"],
        git: false,
        edit: None,
        draft: false,
    },
];

/// Writes one file at an absolute path, creating its parent folders.
fn write_file(path: &Path, contents: impl AsRef<[u8]>) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's folders are created");
    }
    fs::write(path, contents).expect("the file is written");
}

/// Runs git in a folder with the fixed author, giving its standard output.
fn git(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=osq",
            "-c",
            "user.email=osq@example.com",
            "-c",
            "commit.gpgsign=false",
        ])
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

/// The worktree folder of one fixture change.
fn worktree_path(root: &Path, folder: &str) -> PathBuf {
    root.join("trees").join(folder)
}

/// The active change folder inside one worktree.
fn change_path(root: &Path, folder: &str) -> PathBuf {
    worktree_path(root, folder)
        .join("openspec")
        .join("changes")
        .join(folder)
}

/// Ticks `tasks.md` in the `004-plan-edits` worktree.
fn tick_tasks(worktree: &Path) {
    let tasks = change_path_of(worktree).join("tasks.md");
    write_file(&tasks, TASKS.replace("- [ ]", "- [x]"));
}

/// The `004-plan-edits` change folder of one worktree.
fn change_path_of(worktree: &Path) -> PathBuf {
    worktree
        .join("openspec")
        .join("changes")
        .join("004-plan-edits")
}

/// Ticks `tasks.md`, appends to `proposal.md` and writes `notes.md`.
fn plan_edits(worktree: &Path) {
    tick_tasks(worktree);
    let folder = change_path_of(worktree);
    let proposal = folder.join("proposal.md");
    let mut text = fs::read_to_string(&proposal).expect("the proposal reads");
    text.push_str("\nA new line.\n");
    write_file(&proposal, text);
    write_file(&folder.join("notes.md"), "notes\n");
}

/// Ticks `tasks.md` and writes a `.run` file.
fn run_file(worktree: &Path) {
    tick_tasks(worktree);
    write_file(
        &change_path_of(worktree).join(".run").join("note.txt"),
        "note\n",
    );
}

/// Writes a draft `001-dead` copy in the repository's checkout.
fn draft(repo: &Path) {
    write_file(
        &repo.join("openspec/changes/001-dead/proposal.md"),
        "# 001 draft\n",
    );
}

/// Builds the row's scratch repository as the golden script builds it.
fn repository(root: &Path, git_on: bool) -> PathBuf {
    let repo = root.join("repo");
    fs::create_dir_all(repo.join("checks")).expect("the checks folder is created");
    fs::create_dir_all(repo.join("src")).expect("the source folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    write_file(&repo.join("README.md"), "fixture\n");
    write_file(&repo.join("checks/pass.sh"), "exit 0\n");
    write_file(&repo.join("src/a.txt"), "main\n");
    write_file(
        &repo.join("osq.config.mjs"),
        format!("export default {{ vcs: {{ enabled: {git_on}, author: '{AUTHOR}' }} }};\n"),
    );
    write_file(
        &repo.join("osq.toml"),
        format!("[vcs]\nenabled = {git_on}\nauthor = \"{AUTHOR}\"\n"),
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
        let change = change_path(root, folder);
        copy_tree(&fixture("active-project").join(folder), &change);
        if folder == "003-recert" {
            write_file(&worktree.join("src/a.txt"), "worktree\n");
        }
        if folder == "004-plan-edits" {
            write_file(&change.join("tasks.md"), TASKS);
        }
        git(&worktree, &["add", "-A"]);
        git(
            &worktree,
            &["commit", "-q", "-m", &format!("osq: {folder} approved")],
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
    /// The worktree change folder's `.run` tree dump.
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

/// Reads one golden from the crate's copied `active-golden` fixture.
fn golden(name: &str) -> Golden {
    let path = fixture("active-golden").join(format!("{name}.txt"));
    parse(&fs::read_to_string(path).expect("the golden reads"))
}

/// Writes a line that starts `recertified_at: ` as the golden script does.
fn blank_recertified(text: &str) -> String {
    text.split('\n')
        .map(|line| {
            if line.starts_with("recertified_at: ") {
                "recertified_at: <timestamp>"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Compares one row's result, worktree tree, branch tip and worktree status.
fn check_row(row: &Row) {
    let root = scratch("retry_active", row.name);
    let repo = repository(&root, row.git);
    let worktree = worktree_path(&root, row.folder);
    match row.edit {
        Some(Edit::PlanEdits) => plan_edits(&worktree),
        Some(Edit::RunFile) => run_file(&worktree),
        None => {}
    }
    if row.draft {
        draft(&repo);
    }
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

/// Compares one row's worktree tree, branch tip and worktree status.
fn check_git(root: &Path, folder: &str, expected: &Golden, name: &str) {
    let change = change_path(root, folder);
    assert_eq!(
        blank_recertified(&dump(&change)),
        expected.tree,
        "{name}: tree"
    );
    let branch = format!("osq/{folder}");
    let tip = git(&root.join("repo"), &["log", "-1", "--format=%s", &branch]);
    assert_eq!(tip.trim_end(), expected.tip, "{name}: tip");
    let status = git(
        &worktree_path(root, folder),
        &["status", "--porcelain", "--untracked-files=all"],
    );
    assert_eq!(status, expected.status, "{name}: status");
}

/// Proves every row of "Active worktree retry equals TypeScript's".
///
/// Covers: rust-retry/active-worktree-retry-equals-typescript-s
#[test]
fn active_worktree_retry_equals_typescript() {
    for row in &ROWS {
        check_row(row);
    }
}

/// Proves a worktree change with uncommitted plan edits is refused untouched.
///
/// Covers: rust-retry/plan-edits-refused
#[test]
fn plan_edits_refused() {
    let root = scratch("retry_active", "plan-edits-refused");
    let repo = repository(&root, true);
    let change = change_path(&root, "004-plan-edits");
    git(&change, &["mv", "tasks/1.md", "tasks/2.md"]);
    write_file(&change.join(".run/extra.txt"), "extra\n");
    let before = tree(&change);
    let error = run(&repo, ["4", "1"]).expect_err("the plan edits are refused");
    assert_eq!(
        failed_message(error),
        "Change 004 has plan edits not committed in its worktree: tasks/1.md, tasks/2.md. Run osq approve 004 to approve them."
    );
    assert_eq!(tree(&change), before, "the change folder is unchanged");
}

/// Proves a change in the checkout is never refused for plan edits.
///
/// Covers: rust-retry/plan-edits-refused
#[test]
fn root_tree_plan_edits_are_never_refused() {
    let root = scratch("retry_active", "root-tree");
    let repo = repository(&root, true);
    let change = repo.join("openspec/changes/005-checkout");
    copy_tree(&fixture("active-project").join("001-dead"), &change);
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "osq: 005-checkout approved"]);
    let proposal = change.join("proposal.md");
    let mut text = fs::read_to_string(&proposal).expect("the proposal reads");
    text.push_str("\nA new line.\n");
    write_file(&proposal, text);
    write_file(&change.join("notes.md"), "notes\n");
    let seal = change_folder_seal(&change).expect("the folder seals");
    write_file(
        &change.join(".run/approved"),
        format!("{}\n", seal.as_str()),
    );
    let output = run(&repo, ["5", "1"]).expect("the checkout change retries");
    assert_eq!(
        output.text,
        "Retried 005 task 1 (next attempt: 2)\n  Reason: verify_red\n  Retained: .run/dead/1.1.md\n"
    );
}

/// Proves an archived match is not shadowed by another active change.
///
/// Covers: rust-retry/archived-retry-equals-typescript-s
#[test]
fn archived_retry_ignores_a_matching_active_entry() {
    let root = scratch("retry_active", "archived-over-active");
    let repo = repository(&root, true);
    let worktree = worktree_path(&root, "006-stale");
    fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
        .expect("the trees folder is created");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/006-stale",
            worktree.to_str().expect("the path is UTF-8"),
            "main",
        ],
    );
    let archive = worktree
        .join("openspec")
        .join("changes")
        .join("archive")
        .join("006-stale");
    copy_tree(&fixture("archived-project").join("002-stale"), &archive);
    git(&worktree, &["add", "-A"]);
    git(
        &worktree,
        &["commit", "-q", "-m", "osq: 006-stale archived"],
    );
    let error = run(&repo, ["6", "change"]).expect_err("the archived change refuses");
    assert_eq!(
        failed_message(error),
        "Change 006 no longer matches its approved hash. Run `osq approve 006` before retrying."
    );
}
