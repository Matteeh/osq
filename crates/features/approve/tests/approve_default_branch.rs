//! Proves default-branch worktree approvals, their refusals and recorded stops.

mod worktree_support;

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::process::Command;

use osq_kernel_storage::task_scope_hash;
use serde_json::Value;

use worktree_support::{Repo, approve, branches, build, record_lines};

/// The change every row approves.
const FOLDER: &str = "001-alpha-twice";
/// The change's branch.
const BRANCH: &str = "osq/001-alpha-twice";
/// A change-level verify regression.
const VERIFY_RED: &str = "---\nreason: sync_verify_red\n---\nsync_verify_red on main\n";
/// A change-level requirement change.
const REQUIREMENT: &str = "---\nreason: requirement_changed\n---\nrequirement_changed on main\n";
/// The running lock a refusal row writes.
const RUNNING: &str = "{\"pid\":999999,\"startedAt\":0}\n";

/// One golden split into the sections the scenario compares.
struct Golden {
    /// The outcome line followed by the approval lines.
    outcome: Vec<String>,
    /// Every commit the run added.
    commits: Vec<String>,
    /// Every `osq/` branch and its tip's subject.
    branches: Vec<String>,
    /// The tree record's lines.
    record: Vec<String>,
    /// Every `.run/` file after TypeScript's approval and retry.
    tree: Vec<String>,
}

/// One worktree approval row's case, golden name, marker and plan edit.
type Row = (&'static str, &'static str, &'static str, bool);

/// Proves every row of "Default-branch worktree approvals".
///
/// Covers: rust-approve/default-branch-worktree-approvals
#[test]
fn default_branch_worktree_approvals() {
    let rows: [Row; 3] = [
        ("merge-001", "merge-001", VERIFY_RED, true),
        ("merge-noedit-001", "merge-noedit", VERIFY_RED, false),
        ("requirement-001", "requirement", REQUIREMENT, true),
    ];
    for (name, case_name, marker, edit) in rows {
        let case = Case {
            name: case_name,
            archived: name != "requirement-001",
            marker: Some(marker),
            edit,
        };
        let repo = golden_repo(&case, &[]);
        let before = golden_git(&repo.path, &["rev-parse", BRANCH])
            .trim()
            .to_owned();
        let main = golden_git(&repo.path, &["rev-parse", "main"])
            .trim()
            .to_owned();
        let result = approve(&repo.path, &["1"]).unwrap_or_else(|error| panic!("{name}: {error}"));
        let golden = golden(name);
        assert_eq!(
            result
                .text
                .replace(&repo.root.display().to_string(), "<root>"),
            outcome_text(&golden),
            "{name}: approval lines"
        );
        assert_eq!(
            commit_lines(&repo, &before),
            golden.commits,
            "{name}: commits"
        );
        assert_eq!(branch_lines(&repo), golden.branches, "{name}: branches");
        assert_eq!(records(&repo), golden.record, "{name}: record");
        check_tree(&repo, &golden, &main, marker, name);
    }
}

/// Proves every row of "Default-branch refusals".
///
/// Covers: rust-approve/default-branch-refusals
#[test]
fn default_branch_refusals() {
    let authorless = golden_repo(
        &Case {
            name: "refusals-no-author",
            archived: true,
            marker: Some(VERIFY_RED),
            edit: true,
        },
        &[],
    );
    fs::write(authorless.path.join("osq.toml"), "[vcs]\nenabled = true\n")
        .expect("osq.toml is written");
    check_refusal(
        &authorless,
        "vcs.author is required when vcs.enabled is true",
        "no-author",
    );

    let running = golden_repo(
        &Case {
            name: "refusals-running",
            archived: false,
            marker: Some(REQUIREMENT),
            edit: true,
        },
        &[],
    );
    let folder = running.worktree_folder(FOLDER);
    fs::remove_file(folder.join(".run/done/1")).expect("the done marker is removed");
    fs::create_dir_all(folder.join(".run/running")).expect("the running folder is created");
    fs::write(folder.join(".run/running/1.pid"), RUNNING).expect("the lock is written");
    check_refusal(
        &running,
        "001-alpha-twice has a task running; approve it after the task ends",
        "running",
    );
}

/// Proves a sync stop after the approval commit is recorded as the scenario says.
///
/// Covers: rust-approve/approval-stops-are-recorded
#[test]
fn approval_stops_are_recorded() {
    let repo = golden_repo(
        &Case {
            name: "stops",
            archived: false,
            marker: Some(REQUIREMENT),
            edit: true,
        },
        &["prepare = \"node -e \\\"process.exit(3)\\\"\""],
    );
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let folder = repo.worktree_folder(FOLDER);
    let error = approve(&repo.path, &["1"]).expect_err("the prepare stops the sync");
    let message = error
        .to_string()
        .strip_prefix("approve failed: ")
        .expect("the failure names approve")
        .to_owned();
    assert!(
        message.starts_with(&format!(
            "prepare failed in worktree {} on branch osq/{FOLDER}:",
            worktree.display()
        )),
        "the stop is the sync's: {message}"
    );
    assert_eq!(
        golden_git(&repo.path, &["log", "-1", "--format=%s", BRANCH]).trim(),
        "osq: 001 approved",
        "the branch holds the approval commit"
    );
    assert!(
        !golden_git_status(&worktree, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]),
        "no merge is in progress"
    );
    assert_eq!(
        fs::read_to_string(folder.join(".run/regressed/change.md")).expect("the marker reads"),
        format!("---\nreason: requirement_changed\n---\n{message}\n"),
        "the marker keeps the reason it had"
    );
    let events =
        fs::read_to_string(folder.join(".run/events/change.jsonl")).expect("the events read");
    let lines: Vec<&str> = events.lines().collect();
    assert_eq!(lines.len(), 2, "the approval and the stop");
    let approved: Value = serde_json::from_str(lines[0]).expect("the approval parses");
    assert_eq!(approved["type"], "approved", "the approval line");
    let stopped: Value = serde_json::from_str(lines[1]).expect("the stop parses");
    assert_eq!(stopped["type"], "regressed", "the stop's type");
    assert_eq!(stopped["data"]["task"], "change", "the stop's task");
    assert_eq!(
        stopped["data"]["reason"], "sync_failed",
        "the stop's reason"
    );
    assert_eq!(stopped["data"]["output"], message, "the stop's output");
}

/// Checks a refusal kept every branch, record line and change folder file.
fn check_refusal(repo: &worktree_support::Repo, message: &str, name: &str) {
    let before = snapshot(repo);
    let error = approve(&repo.path, &["1"]).expect_err("the row is refused");
    assert_eq!(
        error.to_string(),
        format!("approve failed: {message}"),
        "{name}: message"
    );
    assert_eq!(snapshot(repo), before, "{name}: no write");
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
fn snapshot(repo: &worktree_support::Repo) -> State {
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
    let changes = repo.root.join("worktrees/repo").join(FOLDER);
    let changes = changes.join("openspec/changes");
    State {
        branches: tips,
        record: record_lines(repo),
        changes: read_tree(&changes),
    }
}

/// The outcomes, commits, branches, record and tree a golden holds.
fn golden(name: &str) -> Golden {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/default-branch-golden")
        .join(format!("{name}.txt"));
    let text = fs::read_to_string(path).expect("the golden reads");
    parse_golden(&text)
}

/// The approval lines a successful golden carries, each followed by a newline.
fn outcome_text(golden: &Golden) -> String {
    format!("{}\n", golden.outcome[1..].join("\n"))
}

/// The commits the run added to the branch, as the golden script writes them.
fn commit_lines(repo: &worktree_support::Repo, before: &str) -> Vec<String> {
    let tip = golden_git(&repo.path, &["rev-parse", BRANCH])
        .trim()
        .to_owned();
    let ancestor = golden_git_status(&repo.path, &["merge-base", "--is-ancestor", before, &tip]);
    let from = if ancestor { before } else { "main" };
    let range = format!("{from}..{BRANCH}");
    let commits: Vec<String> = golden_git(
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
        let log = golden_git(&repo.path, &["log", "-1", "--format=%s%n%an <%ae>", &sha]);
        lines.extend(log.trim().lines().map(str::to_owned));
        let parent = format!("{sha}^1");
        let changed = golden_git(&repo.path, &["diff", "--name-status", &parent, &sha]);
        let mut entries: Vec<String> = changed
            .trim()
            .lines()
            .filter(|line| !line.is_empty() && !left_out(line))
            .map(str::to_owned)
            .collect();
        entries.sort();
        lines.extend(entries.into_iter().map(|line| format!("  {line}")));
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
fn branch_lines(repo: &worktree_support::Repo) -> Vec<String> {
    golden_git(
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

/// The tree record's lines with `<root>` and the case's paths in place.
fn records(repo: &worktree_support::Repo) -> Vec<String> {
    record_lines(repo)
        .into_iter()
        .map(|line| line.replace(&repo.root.display().to_string(), "<root>"))
        .collect()
}

/// Checks the merged tree's `.run/` files against the golden's.
fn check_tree(
    repo: &worktree_support::Repo,
    golden: &Golden,
    main: &str,
    marker: &str,
    name: &str,
) {
    let folder = repo.worktree_folder(FOLDER);
    let actual = run_sections(&folder, main);
    let mut expected: BTreeMap<String, String> = sections(&golden.tree).into_iter().collect();
    let seal = expected
        .get(".run/approved")
        .cloned()
        .expect("the golden holds the seal");
    expected.remove(".run/regressed/change.1.md");
    expected.insert(
        ".run/regressed/change.md".to_owned(),
        marker.trim_end().to_owned(),
    );
    let events = expected
        .remove(".run/events/change.jsonl")
        .expect("the golden holds events");
    for (path, content) in &expected {
        assert_eq!(actual.get(path), Some(content), "{name}: {path}");
    }
    assert_eq!(
        actual.len(),
        expected.len() + 1,
        "{name}: no other .run file"
    );
    check_events(&actual, &events, &seal, name);
}

/// Checks the approval and sync events, ignoring the sync's duration.
fn check_events(actual: &BTreeMap<String, String>, events: &str, seal: &str, name: &str) {
    let found = actual
        .get(".run/events/change.jsonl")
        .unwrap_or_else(|| panic!("{name}: the events"));
    let lines: Vec<&str> = found.lines().collect();
    assert_eq!(lines.len(), 2, "{name}: approval then sync");
    let approved: Value =
        serde_json::from_str(lines[0]).unwrap_or_else(|error| panic!("{name}: {error}"));
    assert_eq!(approved["type"], "approved", "{name}: approval type");
    assert_eq!(approved["data"]["hash"], seal, "{name}: seal");
    assert_eq!(
        approved["data"]["targets"],
        serde_json::json!(["change"]),
        "{name}: targets"
    );
    let synced: Value =
        serde_json::from_str(lines[1]).unwrap_or_else(|error| panic!("{name}: {error}"));
    let golden_synced = events
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).expect("a golden event parses"))
        .find(|value| value["type"] == "synced")
        .expect("the golden holds the sync event");
    assert_eq!(synced["type"], golden_synced["type"], "{name}: sync type");
    assert_eq!(
        synced["data"]["defaultBranch"], golden_synced["data"]["defaultBranch"],
        "{name}: sync branch"
    );
    assert_eq!(
        synced["data"]["commits"], golden_synced["data"]["commits"],
        "{name}: sync commits"
    );
}

/// The `.run/` files of one change folder, normalized as the golden script writes them.
fn run_sections(folder: &Path, main: &str) -> BTreeMap<String, String> {
    let run = folder.join(".run");
    let mut files = Vec::new();
    collect(&run, &run, &mut files);
    files.sort();
    let mut sections = BTreeMap::new();
    for relative in files {
        if relative == ".run/manifest.json" || relative == ".run/plan.jsonl" {
            continue;
        }
        let text = fs::read_to_string(run.join(&relative)).expect("a .run file is text");
        let is_event = Path::new(&relative)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("jsonl"));
        let content = if is_event {
            text.lines()
                .filter(|line| !line.is_empty())
                .map(event_line)
                .collect::<Vec<String>>()
                .join("\n")
        } else {
            normalize(&text)
        };
        sections.insert(format!(".run/{relative}"), content.replace(main, "<main>"));
    }
    sections
}

/// One event line as the golden script writes it, with its timestamp hidden.
fn event_line(line: &str) -> String {
    let mut value: Value = serde_json::from_str(line).expect("an event parses");
    if value.get("timestamp").is_some() {
        value["timestamp"] = Value::String("<timestamp>".to_owned());
    }
    value.to_string()
}

/// One text file as the golden script writes it.
fn normalize(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.starts_with("recertified_at: ") {
                "recertified_at: <ts>".to_owned()
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<String>>()
        .join("\n")
}

/// Splits golden tree lines into their path and content.
fn sections(lines: &[String]) -> Vec<(String, String)> {
    let mut sections = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;
    for line in lines {
        if let Some(path) = line.strip_prefix("--- ") {
            if let Some((path, content)) = current.take() {
                sections.push((path, content.join("\n")));
            }
            current = Some((path.to_owned(), Vec::new()));
        } else if let Some((_, content)) = current.as_mut() {
            content.push(line.clone());
        }
    }
    if let Some((path, content)) = current {
        sections.push((path, content.join("\n")));
    }
    sections
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
                4 => golden.tree.push(line.to_owned()),
                _ => {}
            },
        }
    }
    golden
}

/// Every file under `dir`, keyed relative to `base`.
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

/// Proves plan edits outside the change folder are not committed as replanned.
///
/// Covers: rust-approve/default-branch-worktree-approvals
#[test]
fn plan_edits_outside_the_change_folder_are_not_replanned() {
    let repo = golden_repo(
        &Case {
            name: "outside-edit",
            archived: true,
            marker: Some(VERIFY_RED),
            edit: false,
        },
        &[],
    );
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    fs::write(worktree.join("notes.txt"), "outside\n").expect("the unrelated file is written");
    let before = golden_git(&repo.path, &["rev-parse", BRANCH])
        .trim()
        .to_owned();
    let result = approve(&repo.path, &["1"]).expect("the unrelated edit is not replanned");
    assert_eq!(
        result
            .text
            .replace(&repo.root.display().to_string(), "<root>"),
        outcome_text(&golden("merge-noedit-001")),
        "the approval still prints"
    );
    assert_eq!(
        commit_lines(&repo, &before),
        golden("merge-noedit-001").commits,
        "no replanned commit is added"
    );
    assert_eq!(
        fs::read_to_string(worktree.join("notes.txt")).expect("the unrelated file reads"),
        "outside\n",
        "the unrelated file stays"
    );
}

/// Proves a living spec the default branch dropped is removed.
///
/// Covers: rust-approve/default-branch-worktree-approvals
#[test]
fn living_specs_follow_the_default_branch() {
    let repo = golden_repo(
        &Case {
            name: "spec-removal",
            archived: false,
            marker: Some(REQUIREMENT),
            edit: true,
        },
        &[],
    );
    add_branch_spec(&repo);
    let before = golden_git(&repo.path, &["rev-parse", BRANCH])
        .trim()
        .to_owned();
    approve(&repo.path, &["1"]).expect("the dropped spec is approved");
    let spec = repo
        .root
        .join("worktrees/repo")
        .join(FOLDER)
        .join("openspec/specs/beta/spec.md");
    assert!(!spec.exists(), "the dropped living spec is removed");
    assert!(
        approval_changes(&repo, &before, "osq: 001 approved")
            .contains(&"D\topenspec/specs/beta/spec.md".to_owned()),
        "the approval commit removes it"
    );
}

/// Proves a spec the approval cannot remove fails the command.
///
/// Covers: rust-approve/default-branch-worktree-approvals
#[test]
fn a_spec_removal_error_fails_the_approval() {
    let repo = golden_repo(
        &Case {
            name: "spec-removal-error",
            archived: false,
            marker: Some(REQUIREMENT),
            edit: true,
        },
        &[],
    );
    add_branch_spec(&repo);
    let spec = repo
        .root
        .join("worktrees/repo")
        .join(FOLDER)
        .join("openspec/specs/beta/spec.md");
    fs::remove_file(&spec).expect("the spec file is removed");
    fs::create_dir_all(&spec).expect("a folder stands in for the spec");
    fs::write(spec.join("nested.md"), "nested\n").expect("the folder is not empty");
    let error = approve(&repo.path, &["1"]).expect_err("the removal fails");
    assert!(
        error.to_string().contains("Is a directory"),
        "the write error is reported: {error}"
    );
}

/// Proves a done marker whose task id has no digits is not recertified.
///
/// Covers: rust-approve/default-branch-worktree-approvals
#[test]
fn a_done_marker_without_a_numeric_id_is_kept() {
    let repo = golden_repo(
        &Case {
            name: "nonnumeric-done",
            archived: true,
            marker: Some(VERIFY_RED),
            edit: false,
        },
        &[],
    );
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let folder = worktree.join("openspec/changes/archive").join(FOLDER);
    fs::copy(folder.join("tasks/1.md"), folder.join("tasks/alpha.md"))
        .expect("the extra task is copied");
    write_done(&worktree, &folder, "alpha");
    let before = fs::read(folder.join(".run/done/alpha")).expect("the done marker reads");
    approve(&repo.path, &["1"]).expect("the non-numeric done marker is kept");
    let moved = repo.worktree_folder(FOLDER).join(".run/done/alpha");
    assert_eq!(
        fs::read(moved).expect("the done marker reads"),
        before,
        "the marker is not recertified"
    );
}

/// Adds a living spec on the change's branch that the default branch lacks.
fn add_branch_spec(repo: &worktree_support::Repo) {
    let worktree = repo.root.join("worktrees/repo").join(FOLDER);
    let spec = worktree.join("openspec/specs/beta/spec.md");
    fs::create_dir_all(spec.parent().expect("the spec has a parent"))
        .expect("the spec folder is created");
    fs::write(spec, "# beta Specification\n").expect("the beta spec is written");
    golden_git(&worktree, &["add", "-A"]);
    golden_git(&worktree, &["commit", "-q", "-m", "add beta spec"]);
}

/// Writes a done marker for `id` with the branch's current scope hash.
fn write_done(worktree: &Path, folder: &Path, id: &str) {
    let scope = vec!["src/alpha/index.js".to_owned()];
    let hash = task_scope_hash(worktree, &scope);
    let mut files = String::new();
    for file in &hash.files {
        use std::fmt::Write as _;
        let _ = writeln!(
            files,
            "  {}: {}",
            file.path,
            file.hash.as_deref().unwrap_or_default()
        );
    }
    fs::create_dir_all(folder.join(".run/done")).expect("the done folder is created");
    fs::write(
        folder.join(".run/done").join(id),
        format!(
            "---\nscope_hash: {}\nscope_files:\n{files}scope_resolver: 2\n---\n2026-10-20T08:00:00.000Z\n",
            hash.hash
        ),
    )
    .expect("the done marker is written");
}

/// The changed files of the commit from `before` whose subject is `subject`.
fn approval_changes(repo: &worktree_support::Repo, before: &str, subject: &str) -> Vec<String> {
    let range = format!("{before}..{BRANCH}");
    let log = golden_git(
        &repo.path,
        &[
            "log",
            "--reverse",
            "--first-parent",
            "--format=%H%x09%s",
            &range,
        ],
    );
    for line in log.lines() {
        let Some((sha, found)) = line.split_once('\t') else {
            continue;
        };
        if found != subject {
            continue;
        }
        let parent = format!("{sha}^1");
        return golden_git(&repo.path, &["diff", "--name-status", &parent, sha])
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect();
    }
    Vec::new()
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

/// Runs git with the golden script's identity, giving its success.
fn golden_git_status(cwd: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_AUTHOR_DATE", GOLDEN_DATE)
        .env("GIT_COMMITTER_DATE", GOLDEN_DATE)
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
