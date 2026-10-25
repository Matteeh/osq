//! Proves the archived worktree change a steered approval finds.

mod worktree_support;

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::process::Command;

use osq_kernel_storage::task_scope_hash;

use worktree_support::{Repo, approve, branches, build, record_lines};

/// The change every row approves.
const FOLDER: &str = "001-alpha-twice";
/// A change-level verify regression.
const VERIFY_RED: &str = "---\nreason: verify_red\n---\nverify_red on main\n";

/// One row of "Archived changes found for steering": its marker and message.
type Row = (&'static str, Option<&'static str>, &'static str);

/// Proves every row of "Archived changes found for steering".
///
/// Covers: rust-approve/archived-changes-found-for-steering
#[test]
fn archived_changes_found_for_steering() {
    let rows: [Row; 2] = [
        (
            "archived-lookup-regressed",
            Some(VERIFY_RED),
            "Change 001-alpha-twice needs steering: change regression (verify_red). \
             Rust approve steers an archived change only past a default-branch trigger.",
        ),
        (
            "archived-lookup-unmarked",
            None,
            "Spec \"1\" not found in <changes>",
        ),
    ];
    for (name, marker, message) in rows {
        let repo = golden_repo(
            &Case {
                name,
                archived: true,
                marker,
                edit: true,
            },
            &[],
        );
        let before = snapshot(&repo);
        let error = approve(&repo.path, &["1"]).expect_err("the row is refused");
        let changes = repo.path.join("openspec").join("changes");
        let expected = message.replace("<changes>", &changes.display().to_string());
        assert_eq!(
            error.to_string(),
            format!("approve failed: {expected}"),
            "{name}: message"
        );
        assert_eq!(snapshot(&repo), before, "{name}: no write");
    }
}

/// One repository state a refusal must leave unchanged.
#[derive(Debug, PartialEq, Eq)]
struct State {
    /// Every `osq/` branch name and its tip.
    branches: Vec<(String, String)>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every file under the worktree's changes directory.
    changes: BTreeMap<String, Vec<u8>>,
}

/// The branches, tree record and change files of one repository.
fn snapshot(repo: &Repo) -> State {
    let mut tips: Vec<(String, String)> = branches(&repo.path)
        .into_iter()
        .map(|branch| {
            let tip = golden_git(&repo.path, &["rev-parse", &branch])
                .trim()
                .to_owned();
            (branch, tip)
        })
        .collect();
    tips.sort();
    State {
        branches: tips,
        record: record_lines(repo),
        changes: read_tree(
            &repo
                .root
                .join("worktrees/repo")
                .join(FOLDER)
                .join("openspec/changes"),
        ),
    }
}

/// Every file under `dir`, keyed relative to it.
fn read_tree(base: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut files = Vec::new();
    collect(base, base, &mut files);
    files
        .into_iter()
        .map(|relative| {
            let bytes = fs::read(base.join(&relative)).expect("the file reads");
            (relative, bytes)
        })
        .collect()
}

/// Adds every file under `dir` to `files`, relative to `base`.
fn collect(base: &Path, dir: &Path, files: &mut Vec<String>) {
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
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.push(relative);
        }
    }
}

/// The golden script's case date.
const GOLDEN_DATE: &str = "2026-10-25T10:00:00Z";
/// The fixture source the golden script moves on `main`.
const MAIN_SOURCE: &str = "module.exports = { runs: 1, name: 'alpha' };\n";
/// The fixture purpose the golden script rewrites on `main`.
const OLD_PURPOSE: &str = "The alpha capability of the approve fixture repository.";
/// The purpose the golden script leaves on `main`.
const MAIN_PURPOSE: &str =
    "The alpha capability of the approve fixture repository, as main has it.";
/// The change every default-branch golden approves.
const GOLDEN_FOLDER: &str = "001-alpha-twice";
/// The seal a golden case writes before the run.
const GOLDEN_OLD_SEAL: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
/// The plan edit the golden script appends to task one.
const GOLDEN_EDIT: &str = "\nSteered past main.\n";

/// One case of `golden/print-default-branch-goldens.mjs.txt`.
struct Case {
    /// The case's name, for its scratch folder.
    name: &'static str,
    /// Whether the change folder sits under `openspec/changes/archive/`.
    archived: bool,
    /// The `.run/regressed/change.md` text, or none for a case without it.
    marker: Option<&'static str>,
    /// Whether the human left an uncommitted edit in task one.
    edit: bool,
}

/// Builds one golden case's scratch repository.
fn golden_repo(case: &Case, extras: &[&str]) -> Repo {
    let repo = build(&format!("default-branch-{}", case.name), extras);
    let checkout = repo.path.join("openspec/changes").join(GOLDEN_FOLDER);
    let target = repo.root.join("worktrees/repo").join(GOLDEN_FOLDER);
    fs::create_dir_all(target.parent().expect("the worktree has a parent"))
        .expect("the worktree parent is created");
    golden_git(
        &repo.path,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/001-alpha-twice",
            &target.to_string_lossy(),
            "main",
        ],
    );
    let changes = target.join("openspec/changes");
    let folder = if case.archived {
        changes.join("archive").join(GOLDEN_FOLDER)
    } else {
        changes.join(GOLDEN_FOLDER)
    };
    fs::create_dir_all(folder.parent().expect("the folder has a parent"))
        .expect("the change folder parent is created");
    copy_tree(&checkout, &folder);
    fs::remove_dir_all(&checkout).expect("the checkout copy is removed");
    write_markers(&target, &folder, case.marker);
    golden_git(&target, &["add", "-A"]);
    golden_git(&target, &["commit", "-q", "-m", "osq: 001 approved"]);
    move_main(&repo.path);
    if case.edit {
        let path = folder.join("tasks/1.md");
        let mut text = fs::read_to_string(&path).expect("the task reads");
        text.push_str(GOLDEN_EDIT);
        fs::write(path, text).expect("the plan edit is written");
    }
    repo
}

/// Writes the old seal, task one's done marker and the case's marker.
fn write_markers(worktree: &Path, folder: &Path, marker: Option<&str>) {
    let run = folder.join(".run");
    fs::create_dir_all(run.join("regressed")).expect("the regressed folder is created");
    fs::create_dir_all(run.join("done")).expect("the done folder is created");
    fs::write(run.join("approved"), format!("{GOLDEN_OLD_SEAL}\n"))
        .expect("the old seal is written");
    let scope = vec!["src/alpha/index.js".to_owned()];
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
        run.join("done").join("1"),
        format!(
            "---\nscope_hash: {}\nscope_files:\n{files}scope_resolver: 2\n---\n2026-10-20T08:00:00.000Z\n",
            hash.hash
        ),
    )
    .expect("the done marker is written");
    if let Some(marker) = marker {
        fs::write(run.join("regressed").join("change.md"), marker).expect("the marker is written");
    }
}

/// Moves the golden script's `main` commit on `repo`.
fn move_main(repo: &Path) {
    fs::write(repo.join("src/alpha/index.js"), MAIN_SOURCE).expect("the source is written");
    let spec = repo.join("openspec/specs/alpha/spec.md");
    let text = fs::read_to_string(&spec).expect("the living spec reads");
    fs::write(spec, text.replace(OLD_PURPOSE, MAIN_PURPOSE)).expect("the living spec is written");
    golden_git(repo, &["commit", "-q", "-a", "-m", "main moved"]);
}

/// Runs git with the golden script's dates and identity, giving its stdout.
fn golden_git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_AUTHOR_DATE", GOLDEN_DATE)
        .env("GIT_COMMITTER_DATE", GOLDEN_DATE)
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
