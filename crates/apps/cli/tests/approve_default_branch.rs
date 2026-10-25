//! Proves default-branch approvals and conflict reopens through the CLI, with
//! every reaction delivering its event.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_cli::{features, run_cli};
use osq_core::event::reasons::FailureReason;
use osq_core::{Envelope, Event, EventKind, parse_event_line};

/// The change every case approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";
/// The seal a case writes before the run.
const OLD_SEAL: &str = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
/// The author the fixture's commits carry.
const AUTHOR: &str = "Osq Bot <bot@example.com>";
/// The date every commit a test makes carries.
const DATE: &str = "2026-10-25T10:00:00Z";
/// The plan edit the case appends to task one.
const EDIT: &str = "\nSteered past main.\n";
/// The fixture source the case moves on `main`.
const MAIN_SOURCE: &str = "module.exports = { runs: 1, name: 'alpha' };\n";
/// The fixture purpose the case rewrites on `main`.
const OLD_PURPOSE: &str = "The alpha capability of the approve fixture repository.";
/// The purpose the case leaves on `main`.
const MAIN_PURPOSE: &str =
    "The alpha capability of the approve fixture repository, as main has it.";
/// The fixture source the conflict case commits before either side changes it.
const FIXTURE_SOURCE: &str = "module.exports = 1;\n";
/// The source the branch writes to a conflicted file.
const BRANCH_SOURCE: &str = "module.exports = 'branch';\n";
/// The source `main` writes to a conflicted file.
const MAIN_FILE_SOURCE: &str = "module.exports = 'main';\n";
/// Task one's done marker, as `computeTaskScopeHash` gives it before `main` moves.
const DONE_1: &str = "---\nscope_hash: sha256:18baaaa75791d4ffa968058edaa5ce48b39eaf88ad46b7bee943c5054d65fa80\nscope_files:\n  src/alpha/index.js: sha256:66aebacd1be118f36b5d94774f5d48dda30e28391c410914ecb0384a58e1cf5a\nscope_resolver: 2\n---\n2026-10-20T08:00:00.000Z\n";
/// A change-level verify regression.
const VERIFY_RED: &str = "---\nreason: sync_verify_red\n---\nsync_verify_red on main\n";
/// A change-level requirement change.
const REQUIREMENT: &str = "---\nreason: requirement_changed\n---\nrequirement_changed on main\n";
/// A change-level sync conflict.
const CONFLICT: &str = "---\nreason: sync_conflict\n---\nsync_conflict on main\n";
/// The message a delta conflict stops with.
const DELTA_MESSAGE: &str = "001-alpha-twice: src/delta.js conflict with main, and no task's scope holds them; run osq plan 001 so a task owns each file, then approve the revised plan";

/// One row of "Default-branch approvals equal TypeScript's".
struct Row {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// Whether the row's `osq.toml` enables git.
    git: bool,
    /// Whether the change folder starts under `openspec/changes/archive/`.
    archived: bool,
    /// The `.run/regressed/change.md` text the case writes.
    marker: &'static str,
    /// Whether the human left an uncommitted edit in task one.
    edit: bool,
}

/// Every row of "Default-branch approvals equal TypeScript's".
const ROWS: [Row; 4] = [
    Row {
        name: "merge-001",
        git: true,
        archived: true,
        marker: VERIFY_RED,
        edit: true,
    },
    Row {
        name: "merge-noedit-001",
        git: true,
        archived: true,
        marker: VERIFY_RED,
        edit: false,
    },
    Row {
        name: "requirement-001",
        git: true,
        archived: false,
        marker: REQUIREMENT,
        edit: true,
    },
    Row {
        name: "git-off-001",
        git: false,
        archived: false,
        marker: CONFLICT,
        edit: true,
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
    /// Every commit the run added.
    commits: Vec<String>,
    /// Every `osq/` branch with its tip's subject.
    branches: Vec<String>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every `.run/` path and its lines.
    tree: Vec<(String, Vec<String>)>,
}

/// Proves every row of "Default-branch approvals equal TypeScript's".
///
/// Covers: rust-cli/default-branch-approvals-equal-typescript-s
#[test]
fn default_branch_approvals_equal_typescript() {
    for row in &ROWS {
        check_row(row);
    }
}

/// Compares one row's output, commits, branches, record and tree with its golden.
fn check_row(row: &Row) {
    let repo = build_row(row);
    let golden = golden(row.name);
    assert_eq!(
        golden.outcome[0], "outcome: output",
        "{}: outcome",
        row.name
    );
    let expected_stdout = format!("{}\n", golden.outcome[1..].join("\n"));
    let before = if row.git {
        git(&repo.path, &["rev-parse", BRANCH]).trim().to_owned()
    } else {
        String::new()
    };
    let result = run_cli(&features(), &repo.path, &args(&["approve", "1"]));
    let root = repo.root.display().to_string();
    assert_eq!(
        result.stdout.replace(&root, "<root>"),
        expected_stdout,
        "{}: stdout",
        row.name
    );
    assert_eq!(result.stderr, "", "{}: stderr", row.name);
    assert_eq!(result.code, 0, "{}: code", row.name);
    assert_eq!(
        commit_lines(&repo, row, &before),
        golden.commits,
        "{}: commits",
        row.name
    );
    assert_eq!(
        branch_lines(&repo, row),
        golden.branches,
        "{}: branches",
        row.name
    );
    assert_eq!(record_lines(&repo), golden.record, "{}: record", row.name);
    check_tree(&repo, row, &golden);
}

/// Compares the change folder's `.run/` tree with the golden's.
fn check_tree(repo: &Repo, row: &Row, golden: &Golden) {
    let main = git(&repo.path, &["rev-parse", "main"]).trim().to_owned();
    let actual = actual_tree(repo, row, &main);
    let expected: Vec<(String, Vec<String>)> = golden
        .tree
        .iter()
        .filter(|(path, lines)| !(is_jsonl(path) && lines.is_empty()))
        .cloned()
        .collect();
    assert_eq!(
        tree_paths(&actual),
        tree_paths(&expected),
        "{}: tree paths",
        row.name
    );
    for ((path, actual), (_, expected)) in actual.iter().zip(&expected) {
        if is_jsonl(path) {
            compare_events(actual, expected, row.name, path);
        } else {
            assert_eq!(actual, expected, "{}: {path}", row.name);
        }
    }
}

/// Proves every row of "Conflicts through the CLI".
///
/// Covers: rust-cli/conflicts-through-the-cli
#[test]
fn conflicts_through_the_cli() {
    check_reopened_conflict();
    check_planning_conflict();
}

/// Checks the `src/beta.js` row reopens tasks two and three and retires the trigger.
fn check_reopened_conflict() {
    let repo = build_conflict("beta", "src/beta.js");
    let folder = repo.change.clone();
    let result = run_cli(&features(), &repo.path, &args(&["approve", "1"]));
    assert_eq!(result.code, 0, "beta: code");
    assert_eq!(result.stderr, "", "beta: stderr");
    assert!(
        result.stdout.ends_with(
            "  Reopened tasks 2 and 3 (src/beta.js conflicted); kept task 1\n  Continues from task 2\n"
        ),
        "beta: reopened lines: {}",
        result.stdout
    );
    assert_eq!(
        fs::read_to_string(folder.join(".run/regressed/change.1.md")).expect("the marker reads"),
        CONFLICT,
        "beta: the retired trigger keeps its reason"
    );
    assert!(
        !folder.join(".run/regressed/change.md").exists(),
        "beta: no trigger is left"
    );
    let last = last_event(&folder, "change");
    let Event::Retry(data) = last.event else {
        panic!("beta: the change ends with a retry, got {:?}", last.event);
    };
    assert_eq!(data.target, "change", "beta: the retry's target");
    assert_eq!(data.reason, FailureReason::SyncConflict, "beta: reason");
    assert_eq!(data.attempt, 2, "beta: attempt");
    for id in ["1", "2.1", "3.1"] {
        assert!(
            folder.join(".run/done").join(id).exists(),
            "beta: done/{id} exists"
        );
    }
}

/// Checks the `src/delta.js` row stops for planning and keeps every done task.
fn check_planning_conflict() {
    let repo = build_conflict("delta", "src/delta.js");
    let folder = repo.change.clone();
    let result = run_cli(&features(), &repo.path, &args(&["approve", "1"]));
    assert_eq!(result.code, 1, "delta: code");
    assert_eq!(result.stdout, "", "delta: stdout");
    assert_eq!(
        fs::read_to_string(folder.join(".run/regressed/change.md")).expect("the marker reads"),
        format!("---\nreason: sync_conflict\n---\n{DELTA_MESSAGE}\n"),
        "delta: the stop marker"
    );
    assert!(
        !folder.join(".run/regressed/change.1.md").exists(),
        "delta: the trigger is kept"
    );
    let events = fs::read_to_string(folder.join(".run/events/change.jsonl"))
        .expect("the change events read");
    assert!(
        !events
            .lines()
            .filter_map(|line| parse_event_line(line).ok())
            .any(|envelope| envelope.event.kind() == EventKind::Retry),
        "delta: no retry is recorded"
    );
    for id in ["1", "2", "3"] {
        assert!(
            folder.join(".run/done").join(id).exists(),
            "delta: done/{id} is kept"
        );
    }
}

/// Reads the last `events/<id>.jsonl` line as an envelope.
fn last_event(folder: &Path, id: &str) -> Envelope {
    let path = folder.join(".run/events").join(format!("{id}.jsonl"));
    let text = fs::read_to_string(path).expect("the task events read");
    parse_event_line(text.lines().next_back().expect("an event line is written"))
        .expect("the event line parses")
}

/// Builds the golden script's repository for one row.
fn build_row(row: &Row) -> Repo {
    let root = scratch(&format!("default-branch-{}", row.name));
    let path = root.join("repo");
    copy_tree(&fixture(), &path);
    init_repo(&path, &root.join("worktrees"), row.git);
    let checkout = path.join("openspec/changes").join(FOLDER);
    if !row.git {
        write_markers(&checkout, row.marker);
        if row.edit {
            edit(&checkout);
        }
        return Repo {
            root,
            path,
            change: checkout,
        };
    }
    let worktree = root.join("worktrees/repo").join(FOLDER);
    fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    git(
        &path,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            BRANCH,
            &worktree.to_string_lossy(),
            "main",
        ],
    );
    let changes = worktree.join("openspec/changes");
    let folder = if row.archived {
        changes.join("archive").join(FOLDER)
    } else {
        changes.join(FOLDER)
    };
    fs::create_dir_all(folder.parent().expect("the folder has a parent"))
        .expect("the change folder parent is created");
    copy_tree(&checkout, &folder);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_markers(&folder, row.marker);
    git(&worktree, &["add", "-A"]);
    git(&worktree, &["commit", "-q", "-m", "osq: 001 approved"]);
    move_main(&path, &[]);
    if row.edit {
        edit(&folder);
    }
    Repo {
        root,
        path,
        change: folder,
    }
}

/// Builds one "Conflicts through the CLI" row with done tasks one to three.
fn build_conflict(name: &str, file: &str) -> Repo {
    let root = scratch(&format!("conflict-{name}"));
    let path = root.join("repo");
    copy_tree(&fixture(), &path);
    init_repo(&path, &root.join("worktrees"), true);
    for fixture_file in ["src/beta.js", "src/gamma.js"] {
        write_source(&path.join(fixture_file), FIXTURE_SOURCE);
    }
    git(&path, &["add", "--", "src/beta.js", "src/gamma.js"]);
    git(&path, &["commit", "-q", "--amend", "--no-edit"]);
    let checkout = path.join("openspec/changes").join(FOLDER);
    let worktree = root.join("worktrees/repo").join(FOLDER);
    fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    git(
        &path,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            BRANCH,
            &worktree.to_string_lossy(),
            "main",
        ],
    );
    let folder = worktree.join("openspec/changes").join(FOLDER);
    fs::create_dir_all(folder.parent().expect("the change folder has a parent"))
        .expect("the change folder parent is created");
    copy_tree(&checkout, &folder);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_tasks(&folder);
    write_source(&worktree.join(file), BRANCH_SOURCE);
    write_conflict_markers(&folder);
    git(&worktree, &["add", "-A"]);
    git(&worktree, &["commit", "-q", "-m", "osq: 001 approved"]);
    move_main(&path, &[file]);
    let task = folder.join("tasks/1.md");
    let mut text = fs::read_to_string(&task).expect("the task reads");
    text.push_str(EDIT);
    fs::write(task, text).expect("the plan edit is written");
    Repo {
        root,
        path,
        change: folder,
    }
}

/// Initializes a repository with the golden script's settings and first commit.
fn init_repo(path: &Path, worktrees: &Path, git_on: bool) {
    git(path, &["init", "-q", "-b", "main"]);
    git(path, &["config", "user.name", "Osq Tester"]);
    git(path, &["config", "user.email", "tester@example.com"]);
    git(path, &["config", "commit.gpgsign", "false"]);
    exclude(path);
    write_config(path, worktrees, git_on);
    git(
        path,
        &["add", "-A", "--", ".", ":!openspec/changes/001-alpha-twice"],
    );
    git(path, &["commit", "-q", "-m", "fixture"]);
}

/// Writes tasks two and three as copies of task one with their own scopes.
fn write_tasks(folder: &Path) {
    let base = fs::read_to_string(folder.join("tasks/1.md")).expect("task one reads");
    for (id, scope) in [("2", "src/beta.js"), ("3", "src/gamma.js")] {
        let text = base.replace("src/alpha/index.js", scope);
        fs::write(folder.join("tasks").join(format!("{id}.md")), text)
            .expect("the extra task is written");
    }
}

/// Writes the old seal and each marker under a change folder's `.run/`.
fn write_markers(folder: &Path, marker: &str) {
    let run = folder.join(".run");
    fs::create_dir_all(run.join("regressed")).expect("the regressed folder is created");
    fs::create_dir_all(run.join("done")).expect("the done folder is created");
    fs::write(run.join("approved"), format!("{OLD_SEAL}\n")).expect("the old seal is written");
    fs::write(run.join("done/1"), DONE_1).expect("the done marker is written");
    fs::write(run.join("regressed/change.md"), marker).expect("the marker is written");
}

/// Writes the old seal, the conflict trigger and three done markers.
fn write_conflict_markers(folder: &Path) {
    let run = folder.join(".run");
    fs::create_dir_all(run.join("regressed")).expect("the regressed folder is created");
    fs::create_dir_all(run.join("done")).expect("the done folder is created");
    fs::write(run.join("approved"), format!("{OLD_SEAL}\n")).expect("the old seal is written");
    fs::write(run.join("regressed/change.md"), CONFLICT).expect("the marker is written");
    for id in ["1", "2", "3"] {
        fs::write(run.join("done").join(id), DONE_1).expect("the done marker is written");
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

/// Moves `main` as the golden script does, writing each named file too.
fn move_main(repo: &Path, files: &[&str]) {
    fs::write(repo.join("src/alpha/index.js"), MAIN_SOURCE).expect("the alpha source is written");
    let spec = repo.join("openspec/specs/alpha/spec.md");
    let text = fs::read_to_string(&spec).expect("the living spec reads");
    fs::write(spec, text.replace(OLD_PURPOSE, MAIN_PURPOSE)).expect("the living spec is written");
    for file in files {
        write_source(&repo.join(file), MAIN_FILE_SOURCE);
    }
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", "main moved"]);
}

/// Writes one source file, creating its folders.
fn write_source(path: &Path, source: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the source folder is created");
    }
    fs::write(path, source).expect("the source is written");
}

/// A golden with its placeholders left in place.
fn golden(name: &str) -> Golden {
    let path = fixtures()
        .join("default-branch-golden")
        .join(format!("{name}.txt"));
    let text = fs::read_to_string(path).expect("the golden reads");
    parse_golden(&text)
}

/// Splits a golden into its outcome, commit, branch, record and tree sections.
fn parse_golden(text: &str) -> Golden {
    let mut golden = Golden {
        outcome: Vec::new(),
        commits: Vec::new(),
        branches: Vec::new(),
        record: Vec::new(),
        tree: Vec::new(),
    };
    let mut section = 0;
    for line in text.lines() {
        match line {
            "commits:" => section = 1,
            "branches:" => section = 2,
            "record:" => section = 3,
            "tree:" => section = 4,
            "status:" => section = 5,
            _ => match section {
                0 => golden.outcome.push(line.to_owned()),
                1 => golden.commits.push(line.to_owned()),
                2 => golden.branches.push(line.to_owned()),
                3 => golden.record.push(line.to_owned()),
                4 => match line.strip_prefix("--- ") {
                    Some(path) => golden.tree.push((path.to_owned(), Vec::new())),
                    None => golden
                        .tree
                        .last_mut()
                        .expect("a golden tree line follows a path")
                        .1
                        .push(line.to_owned()),
                },
                _ => {}
            },
        }
    }
    golden
}

/// The commits the run added, as the golden script writes them.
fn commit_lines(repo: &Repo, row: &Row, before: &str) -> Vec<String> {
    if !row.git {
        return vec!["none".to_owned()];
    }
    let tip = git(&repo.path, &["rev-parse", BRANCH]).trim().to_owned();
    let from = if git_succeeds(&repo.path, &["merge-base", "--is-ancestor", before, &tip]) {
        before
    } else {
        "main"
    };
    let range = format!("{from}..{BRANCH}");
    let commits: Vec<String> = git(
        &repo.path,
        &["rev-list", "--reverse", "--first-parent", &range],
    )
    .lines()
    .filter(|sha| !sha.is_empty())
    .map(str::to_owned)
    .collect();
    if commits.is_empty() {
        return vec!["none".to_owned()];
    }
    let mut lines = Vec::new();
    for sha in commits {
        let log = git(&repo.path, &["log", "-1", "--format=%s%n%an <%ae>", &sha]);
        lines.extend(log.trim().lines().map(str::to_owned));
        let parent = format!("{sha}^1");
        let changed = git(&repo.path, &["diff", "--name-status", &parent, &sha]);
        let mut entries: Vec<String> = changed
            .trim()
            .lines()
            .filter(|line| !line.is_empty() && !left_out(line))
            .map(|line| format!("  {line}"))
            .collect();
        entries.sort();
        lines.extend(entries);
    }
    lines
}

/// Whether a commit line names a `.run` file the goldens leave out.
fn left_out(line: &str) -> bool {
    let path = line.split('\t').next_back().unwrap_or_default();
    path.ends_with("/.run/manifest.json")
        || path.ends_with("/.run/plan.jsonl")
        || path.ends_with("/.run/events/change.jsonl")
}

/// Every `osq/` branch with its tip's subject, as the golden script writes them.
fn branch_lines(repo: &Repo, row: &Row) -> Vec<String> {
    if !row.git {
        return vec!["none".to_owned()];
    }
    git(
        &repo.path,
        &[
            "for-each-ref",
            "--format=%(refname:short) %(subject)",
            "refs/heads/osq/",
        ],
    )
    .lines()
    .filter(|line| !line.is_empty())
    .map(str::to_owned)
    .collect()
}

/// The tree record's lines, each `at` written as `<at>` and the root hidden.
fn record_lines(repo: &Repo) -> Vec<String> {
    let Ok(text) = fs::read_to_string(repo.path.join(".git/osq-trees.jsonl")) else {
        return Vec::new();
    };
    let root = repo.root.display().to_string();
    text.lines()
        .filter(|line| !line.is_empty())
        .map(blank_at)
        .map(|line| line.replace(&root, "<root>"))
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
fn actual_tree(repo: &Repo, row: &Row, main: &str) -> Vec<(String, Vec<String>)> {
    let change = final_folder(repo, row);
    let mut files = Vec::new();
    files_under(&change, &change.join(".run"), &mut files);
    files.sort();
    let root = repo.root.display().to_string();
    let mut sections = Vec::new();
    for path in files {
        if path == ".run/delivery.lock" || path.starts_with(".run/delivered/") {
            continue;
        }
        let text = fs::read_to_string(change.join(&path))
            .unwrap_or_else(|error| panic!("{}: {error}", change.join(&path).display()));
        let mut lines: Vec<String> = if is_jsonl(&path) {
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
        if lines.is_empty() && is_jsonl(&path) {
            continue;
        }
        for line in &mut lines {
            if line.starts_with("recertified_at: ") {
                "recertified_at: <ts>".clone_into(line);
            } else {
                *line = line.replace(main, "<main>").replace(&root, "<root>");
            }
        }
        sections.push((path, lines));
    }
    sections
}

/// The change folder where the run left it.
fn final_folder(repo: &Repo, row: &Row) -> PathBuf {
    if !row.git {
        return repo.path.join("openspec/changes").join(FOLDER);
    }
    let active = repo
        .root
        .join("worktrees/repo")
        .join(FOLDER)
        .join("openspec/changes")
        .join(FOLDER);
    if active.exists() {
        return active;
    }
    repo.root
        .join("worktrees/repo")
        .join(FOLDER)
        .join("openspec/changes/archive")
        .join(FOLDER)
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

/// One event line parsed, its timestamp hidden and its sync duration fixed.
fn normalized(line: &str) -> Envelope {
    let mut envelope = parse_event_line(line).expect("the event line parses");
    "<timestamp>".clone_into(&mut envelope.timestamp);
    if let Event::Synced(data) = &mut envelope.event {
        data.duration = 0_u64.into();
    }
    envelope
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
        .env("GIT_AUTHOR_DATE", DATE)
        .env("GIT_COMMITTER_DATE", DATE)
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

/// Whether git succeeds in `cwd` with the golden script's identity.
fn git_succeeds(cwd: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_AUTHOR_DATE", DATE)
        .env("GIT_COMMITTER_DATE", DATE)
        .env("GIT_AUTHOR_NAME", "Osq Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Osq Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
        .output()
        .expect("git starts")
        .status
        .success()
}

/// The command line's arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its case.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("approve_default_branch")
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
