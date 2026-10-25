//! Proves the conflict reopen and planning-stop rules of default-branch approval.

mod worktree_support;

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::process::Command;

use osq_kernel_storage::task_scope_hash;
use serde_json::Value;

use worktree_support::{Repo, approve, build, git};

/// The change every row approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";
/// A change-level sync conflict.
const CONFLICT: &str = "---\nreason: sync_conflict\n---\nsync_conflict on main\n";
/// The date every commit the tests make carries.
const DATE: &str = "2026-10-25T10:00:00Z";
/// The fixture source the case moves on `main`.
const MAIN_SOURCE: &str = "module.exports = { runs: 1, name: 'alpha' };\n";
/// The fixture purpose the case rewrites on `main`.
const OLD_PURPOSE: &str = "The alpha capability of the approve fixture repository.";
/// The purpose the case leaves on `main`.
const MAIN_PURPOSE: &str =
    "The alpha capability of the approve fixture repository, as main has it.";
/// The seal a case writes before the run.
const OLD_SEAL: &str = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
/// The plan edit the case appends to task one.
const EDIT: &str = "\nSteered past main.\n";
/// The source the fixture commit gives the conflict files.
const FIXTURE_SOURCE: &str = "module.exports = 1;\n";
/// The source the branch writes to a conflicted file.
const BRANCH_SOURCE: &str = "module.exports = 'branch';\n";
/// The source `main` writes to a conflicted file.
const MAIN_FILE_SOURCE: &str = "module.exports = 'main';\n";

/// One "Conflicts reopen the owning tasks" row.
struct Reopen {
    /// The row's scratch folder name.
    name: &'static str,
    /// The files both sides change.
    files: &'static [&'static str],
    /// The tasks whose done marker the branch commit holds.
    done: &'static [&'static str],
    /// The first task that owns a conflicted file.
    first: &'static str,
    /// The row's `  Reopened ` line.
    line: &'static str,
    /// The task the output continues from, or none.
    continues: Option<&'static str>,
}

/// One "Conflicts no task owns stop for planning" row.
struct Planning {
    /// The row's scratch folder name.
    name: &'static str,
    /// The file both sides change.
    file: &'static str,
    /// The message approve fails with.
    message: &'static str,
}

/// Proves every row of "Conflicts reopen the owning tasks".
///
/// Covers: rust-approve/conflicts-reopen-the-owning-tasks
#[test]
fn conflicts_reopen_the_owning_tasks() {
    let rows: [Reopen; 5] = [
        Reopen {
            name: "beta",
            files: &["src/beta.js"],
            done: &["1", "2", "3"],
            first: "2",
            line: "  Reopened tasks 2 and 3 (src/beta.js conflicted); kept task 1",
            continues: Some("2"),
        },
        Reopen {
            name: "gamma",
            files: &["src/gamma.js"],
            done: &["1", "2", "3"],
            first: "3",
            line: "  Reopened task 3 (src/gamma.js conflicted); kept tasks 1 and 2",
            continues: Some("3"),
        },
        Reopen {
            name: "beta-gamma",
            files: &["src/beta.js", "src/gamma.js"],
            done: &["1", "2", "3"],
            first: "2",
            line: "  Reopened tasks 2 and 3 (src/beta.js, src/gamma.js conflicted); kept task 1",
            continues: Some("2"),
        },
        Reopen {
            name: "alpha-gamma",
            files: &["src/alpha/index.js", "src/gamma.js"],
            done: &["1", "2", "3"],
            first: "1",
            line: "  Reopened tasks 1, 2 and 3 (src/alpha/index.js, src/gamma.js conflicted)",
            continues: Some("1"),
        },
        Reopen {
            name: "kept-only",
            files: &["src/beta.js"],
            done: &["1"],
            first: "2",
            line: "  Reopened no task (src/beta.js conflicted); kept task 1",
            continues: Some("2"),
        },
    ];
    for row in &rows {
        let repo = build_repo(
            &format!("conflict-reopen-{}", row.name),
            row.files,
            row.done,
        );
        let folder = repo.worktree_folder(FOLDER);
        let old = done_markers(&folder, row.done);
        let main = git(&repo.path, &["rev-parse", "main"]).trim().to_owned();
        let result =
            approve(&repo.path, &["1"]).unwrap_or_else(|error| panic!("{}: {error}", row.name));
        check_output(&repo, &result.text, &folder, row);
        check_merge(&repo, &main, row);
        check_reopened(&folder, row, &old);
        assert_eq!(
            fs::read_to_string(folder.join(".run/regressed/change.md")).expect("the marker reads"),
            CONFLICT,
            "{}: the trigger is kept",
            row.name
        );
    }
}

/// Proves every row of "Conflicts no task owns stop for planning".
///
/// Covers: rust-approve/conflicts-no-task-owns-stop-for-planning
#[test]
fn conflicts_no_task_owns_stop_for_planning() {
    let rows: [Planning; 2] = [
        Planning {
            name: "delta",
            file: "src/delta.js",
            message: "001-alpha-twice: src/delta.js conflict with main, and no task's scope holds them; run osq plan 001 so a task owns each file, then approve the revised plan",
        },
        Planning {
            name: "notes",
            file: "openspec/changes/001-alpha-twice/notes.md",
            message: "001-alpha-twice: openspec/changes/001-alpha-twice/notes.md conflict with main, and no task's scope holds them; run osq plan 001 so a task owns each file, then approve the revised plan",
        },
    ];
    for row in &rows {
        let repo = build_repo(
            &format!("conflict-planning-{}", row.name),
            &[row.file],
            &["1", "2", "3"],
        );
        let folder = repo.worktree_folder(FOLDER);
        let old = done_markers(&folder, &["1", "2", "3"]);
        let error = approve(&repo.path, &["1"]).expect_err("the row stops for planning");
        assert_eq!(
            error.to_string(),
            format!("approve failed: {}", row.message),
            "{}: message",
            row.name
        );
        assert_eq!(
            git(&repo.path, &["log", "-1", "--format=%s", BRANCH]).trim(),
            "osq: 001 approved",
            "{}: the branch stays at its approval commit",
            row.name
        );
        let worktree = repo.root.join("worktrees/repo").join(FOLDER);
        assert!(
            !git_succeeds(&worktree, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]),
            "{}: no merge is in progress",
            row.name
        );
        for (id, bytes) in &old {
            assert_eq!(
                fs::read(folder.join(".run/done").join(id)).expect("the done marker reads"),
                *bytes,
                "{}: the done marker for {id} is kept",
                row.name
            );
        }
        assert_eq!(
            fs::read_to_string(folder.join(".run/regressed/change.md")).expect("the marker reads"),
            format!("---\nreason: sync_conflict\n---\n{}\n", row.message),
            "{}: the stop marker",
            row.name
        );
        check_stop_events(&folder, row);
    }
}

/// Proves a non-conflict sync stop is recorded as a stop, not reopened as a conflict.
///
/// Covers: rust-approve/approval-stops-are-recorded
#[test]
fn a_non_conflict_stop_is_recorded() {
    let repo = build_repo("conflict-reopen-non-conflict", &[], &["1"]);
    append_prepare(
        &repo.path,
        "node -e \"const fs=require('node:fs'); if (!fs.existsSync('osq-prepare-once')) { fs.writeFileSync('osq-prepare-once','1'); process.exit(3); }\"",
    );
    let folder = repo.worktree_folder(FOLDER);
    let error = approve(&repo.path, &["1"]).expect_err("the first prepare stops the sync");
    let message = error
        .to_string()
        .strip_prefix("approve failed: ")
        .expect("the failure names approve")
        .to_owned();
    assert!(
        message.starts_with("prepare failed in worktree"),
        "the stop is the sync's: {message}"
    );
    assert_eq!(
        fs::read_to_string(folder.join(".run/regressed/change.md")).expect("the marker reads"),
        format!("---\nreason: sync_conflict\n---\n{message}\n"),
        "the marker keeps the reason it had"
    );
    assert_eq!(
        git(&repo.path, &["log", "-1", "--format=%s", BRANCH]).trim(),
        "osq: 001 approved",
        "the branch holds the approval commit"
    );
}

/// Appends a `vcs.prepare` line to `osq.toml`.
fn append_prepare(repo: &Path, command: &str) {
    let path = repo.join("osq.toml");
    let mut text = fs::read_to_string(&path).expect("osq.toml reads");
    let _ = writeln!(text, "prepare = {command:?}");
    fs::write(path, text).expect("osq.toml is written");
}

/// Proves a reopen uses the next retained ordinal across dead, regressed and done.
///
/// Covers: rust-approve/conflicts-reopen-the-owning-tasks
#[test]
fn retained_ordinals_are_used() {
    let repo = build_repo(
        "conflict-reopen-ordinals",
        &["src/beta.js"],
        &["1", "2", "3"],
    );
    let folder = repo.worktree_folder(FOLDER);
    write_retained(&folder, ".run/dead/2.1.md");
    write_retained(&folder, ".run/done/2.3");
    write_retained(&folder, ".run/regressed/3.4.md");
    let result = approve(&repo.path, &["1"]).expect("the conflict reopens");
    assert!(
        result
            .text
            .contains("  Reopened tasks 2 and 3 (src/beta.js conflicted); kept task 1"),
        "the output names both tasks: {}",
        result.text
    );
    assert!(
        !folder.join(".run/done/2").exists() && folder.join(".run/done/2.4").exists(),
        "task two keeps its done marker as .4"
    );
    assert!(
        !folder.join(".run/done/3").exists() && folder.join(".run/done/3.5").exists(),
        "task three keeps its done marker as .5"
    );
    assert_attempt(&folder, "2", 5);
    assert_attempt(&folder, "3", 6);
}

/// Writes one retained marker's folder and file.
fn write_retained(folder: &Path, relative: &str) {
    let path = folder.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the retained folder is created");
    }
    fs::write(path, "retained\n").expect("the retained marker is written");
}

/// Checks one retry event's attempt.
fn assert_attempt(folder: &Path, id: &str, attempt: u64) {
    let path = folder.join(".run/events").join(format!("{id}.jsonl"));
    let text = fs::read_to_string(path).expect("the task events read");
    let event: Value = serde_json::from_str(text.trim()).expect("the retry parses");
    assert_eq!(event["data"]["attempt"], attempt, "{id}'s attempt");
}

/// Checks the approval and reopened lines of a successful row.
fn check_output(repo: &Repo, text: &str, folder: &Path, row: &Reopen) {
    let seal = fs::read_to_string(folder.join(".run/approved"))
        .expect("the seal reads")
        .trim()
        .to_owned();
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let mut expected = vec![
        format!("Approved 001 ({FOLDER})"),
        format!("  Hash: {seal}"),
        format!("  Worktree: {}", worktree.display()),
        format!("  Branch: {BRANCH}"),
        format!("  Merged main into {BRANCH}"),
        row.line.to_owned(),
    ];
    if let Some(task) = row.continues {
        expected.push(format!("  Continues from task {task}"));
    }
    assert_eq!(
        text,
        format!("{}\n", expected.join("\n")),
        "{}: approval lines",
        row.name
    );
}

/// Checks the branch's merge commit and the merged files.
fn check_merge(repo: &Repo, main: &str, row: &Reopen) {
    assert_eq!(
        git(&repo.path, &["log", "-1", "--format=%s", BRANCH]).trim(),
        "osq: 001 sync main",
        "{}: the branch's tip",
        row.name
    );
    let second = format!("{BRANCH}^2");
    assert_eq!(
        git(&repo.path, &["rev-parse", &second]).trim(),
        main,
        "{}: the merge's second parent",
        row.name
    );
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    for file in row.files {
        assert_eq!(
            fs::read_to_string(worktree.join(file)).expect("the merged file reads"),
            MAIN_FILE_SOURCE,
            "{}: {file} holds main's text",
            row.name
        );
    }
}

/// Checks the reopened and kept done markers and the retry events.
fn check_reopened(folder: &Path, row: &Reopen, old: &BTreeMap<String, Vec<u8>>) {
    for id in row.done {
        let active = folder.join(".run/done").join(id);
        if *id >= row.first {
            assert!(!active.exists(), "{}: {id} is reopened", row.name);
            assert_eq!(
                fs::read(folder.join(".run/done").join(format!("{id}.1")))
                    .expect("the retained marker reads"),
                old[*id],
                "{}: {id}'s retained marker",
                row.name
            );
            check_retry(folder, id, row);
        } else {
            assert!(active.exists(), "{}: {id} is kept", row.name);
        }
    }
}

/// Checks one reopened task's `retry` event.
fn check_retry(folder: &Path, id: &str, row: &Reopen) {
    let path = folder.join(".run/events").join(format!("{id}.jsonl"));
    let text = fs::read_to_string(path).expect("the task events read");
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 1, "{}: one retry for {id}", row.name);
    let event: Value = serde_json::from_str(lines[0]).expect("the retry parses");
    assert_eq!(event["type"], "retry", "{}: {id}'s type", row.name);
    assert_eq!(event["data"]["target"], id, "{}: {id}'s target", row.name);
    assert_eq!(
        event["data"]["reason"], "sync_conflict",
        "{}: {id}'s reason",
        row.name
    );
    assert_eq!(event["data"]["attempt"], 2, "{}: {id}'s attempt", row.name);
    assert!(
        event["data"].get("automatic").is_none(),
        "{}: {id} has no automatic key",
        row.name
    );
}

/// Checks the approval and conflict events a planning stop writes.
fn check_stop_events(folder: &Path, row: &Planning) {
    let seal = fs::read_to_string(folder.join(".run/approved"))
        .expect("the seal reads")
        .trim()
        .to_owned();
    let text = fs::read_to_string(folder.join(".run/events/change.jsonl"))
        .expect("the change events read");
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2, "{}: approval then stop", row.name);
    let approved: Value = serde_json::from_str(lines[0]).expect("the approval parses");
    assert_eq!(
        approved["type"], "approved",
        "{}: the approval's type",
        row.name
    );
    assert_eq!(
        approved["data"]["hash"], seal,
        "{}: the approval's seal",
        row.name
    );
    assert_eq!(
        approved["data"]["targets"],
        serde_json::json!(["change"]),
        "{}: the approval's targets",
        row.name
    );
    let stopped: Value = serde_json::from_str(lines[1]).expect("the stop parses");
    assert_eq!(
        stopped["type"], "regressed",
        "{}: the stop's type",
        row.name
    );
    assert_eq!(
        stopped["data"]["task"], "change",
        "{}: the stop's task",
        row.name
    );
    assert_eq!(
        stopped["data"]["reason"], "sync_conflict",
        "{}: the stop's reason",
        row.name
    );
    assert_eq!(
        stopped["data"]["output"], row.message,
        "{}: the stop's output",
        row.name
    );
}

/// Reads every done marker of `ids` before the run.
fn done_markers(folder: &Path, ids: &[&str]) -> BTreeMap<String, Vec<u8>> {
    ids.iter()
        .map(|id| {
            let bytes = fs::read(folder.join(".run/done").join(id)).expect("the done marker reads");
            ((*id).to_owned(), bytes)
        })
        .collect()
}

/// Builds the requirement-001 case with the row's files and done tasks.
fn build_repo(name: &str, files: &[&str], done: &[&str]) -> Repo {
    let repo = build(name, &[]);
    for file in ["src/beta.js", "src/gamma.js"] {
        fs::write(repo.path.join(file), FIXTURE_SOURCE).expect("the fixture file is written");
    }
    git(&repo.path, &["add", "--", "src/beta.js", "src/gamma.js"]);
    git(&repo.path, &["commit", "-q", "--amend", "--no-edit"]);
    let checkout = repo.path.join("openspec/changes").join(FOLDER);
    let target = repo.root.join("worktrees/repo").join(FOLDER);
    fs::create_dir_all(target.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    git(
        &repo.path,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            BRANCH,
            &target.to_string_lossy(),
            "main",
        ],
    );
    let folder = target.join("openspec/changes").join(FOLDER);
    fs::create_dir_all(folder.parent().expect("the change folder has a parent"))
        .expect("the change folder parent is created");
    copy_tree(&checkout, &folder);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_tasks(&folder);
    for file in files {
        write_source(&target.join(file), BRANCH_SOURCE);
    }
    write_markers(&target, &folder, done);
    git(&target, &["add", "-A"]);
    git(&target, &["commit", "-q", "-m", "osq: 001 approved"]);
    move_main(&repo.path, files);
    let task = folder.join("tasks/1.md");
    let mut text = fs::read_to_string(&task).expect("the task reads");
    text.push_str(EDIT);
    fs::write(task, text).expect("the plan edit is written");
    repo
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

/// Writes the old seal, the conflict marker and the done markers.
fn write_markers(worktree: &Path, folder: &Path, done: &[&str]) {
    let run = folder.join(".run");
    fs::create_dir_all(run.join("done")).expect("the done folder is created");
    fs::create_dir_all(run.join("regressed")).expect("the regressed folder is created");
    fs::write(run.join("approved"), format!("{OLD_SEAL}\n")).expect("the old seal is written");
    fs::write(run.join("regressed/change.md"), CONFLICT).expect("the marker is written");
    for id in done {
        write_done(worktree, folder, id);
    }
}

/// Writes one task's done marker with its scope's hash on the branch.
fn write_done(worktree: &Path, folder: &Path, id: &str) {
    let scope = scope_of(id);
    let hash = task_scope_hash(worktree, &scope);
    let mut files = String::new();
    for file in &hash.files {
        let _ = writeln!(
            files,
            "  {}: {}",
            file.path,
            file.hash.as_deref().unwrap_or_default()
        );
    }
    fs::write(
        folder.join(".run/done").join(id),
        format!(
            "---\nscope_hash: {}\nscope_files:\n{files}scope_resolver: 2\n---\n2026-10-20T08:00:00.000Z\n",
            hash.hash
        ),
    )
    .expect("the done marker is written");
}

/// The scope a task id holds.
fn scope_of(id: &str) -> Vec<String> {
    let path = match id {
        "1" => "src/alpha/index.js",
        "2" => "src/beta.js",
        _ => "src/gamma.js",
    };
    vec![path.to_owned()]
}

/// Writes one branch or main source file, creating its folders.
fn write_source(path: &Path, source: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the source folder is created");
    }
    fs::write(path, source).expect("the source is written");
}

/// Moves `main` as the golden script does, writing each row's file too.
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

/// Whether git succeeds in `cwd` with the tests' dates and identity.
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
