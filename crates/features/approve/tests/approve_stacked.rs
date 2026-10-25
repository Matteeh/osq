//! Proves stacked approvals against the goldens TypeScript's built `dist` printed.

mod worktree_support;

use std::fs;
use std::path::Path;

use osq_core::{FeatureError, Output};
use worktree_support::{Repo, approve, branches, build, git, record_lines, worktrees};

/// The change every row's first copy comes from.
const ALPHA: &str = "001-alpha-twice";
/// The approval lines the stacked goldens keep.
const KEPT: [&str; 7] = [
    "Approved ",
    "  Hash: ",
    "  Kept rejected branch: ",
    "  Waiting for: ",
    "  Runs after ",
    "  Stacked: ",
    "  Worktree: ",
];
/// The files the goldens leave out.
const LEFT_OUT: [&str; 2] = [".run/manifest.json", ".run/plan.jsonl"];

/// One row of "Stacked approvals equal TypeScript's".
struct Row {
    /// The golden's name without its extension.
    name: &'static str,
    /// The queries `approve` runs, one per step.
    steps: &'static [&'static str],
    /// The folder the last step approves.
    folder: &'static str,
    /// The row's setup after the base commit.
    setup: fn(&Repo),
}

/// Proves every row of "Stacked approvals equal TypeScript's".
///
/// Covers: rust-approve/stacked-approvals-equal-typescript-s
#[test]
fn stacked_approvals_equal_typescript() {
    let rows = [
        Row {
            name: "overlap-003",
            steps: &["1", "3"],
            folder: "003-alpha-thrice",
            setup: one_copy,
        },
        Row {
            name: "chain-004",
            steps: &["1", "3", "4"],
            folder: "004-alpha-four",
            setup: two_copies,
        },
        Row {
            name: "declared-002",
            steps: &["1", "2"],
            folder: "002-gamma",
            setup: gamma_depends,
        },
        Row {
            name: "kept-003",
            steps: &["1", "3"],
            folder: "003-alpha-thrice",
            setup: rejected_thrice,
        },
    ];
    for row in rows {
        let name = format!("stacked_approvals_equal_typescript_{}", row.name);
        let repo = build(&name, &[]);
        (row.setup)(&repo);
        let result = run_steps(&repo, row.steps, row.name);
        assert_eq!(
            format!("{}\n", render(&repo, row.folder, &Ok(result))),
            golden(&format!("{}.txt", row.name)),
            "{}: golden text",
            row.name
        );
    }
}

/// Proves a second stacked approval replaces the first one's folder.
///
/// Covers: rust-approve/stacked-folder-replaced
#[test]
fn stacked_folder_replaced() {
    let repo = build("stacked_folder_replaced_overlap_003", &[]);
    one_copy(&repo);
    let stacked = repo
        .root
        .join("worktrees/repo/.stacked")
        .join("003-alpha-thrice");
    fs::create_dir_all(&stacked).expect("the old stacked folder is created");
    fs::write(stacked.join("note.txt"), "old\n").expect("the old note is written");
    approve(&repo.path, &["1"]).expect("the first approval passes");
    let result = approve(&repo.path, &["3"]);
    assert!(
        result.is_ok(),
        "the second approval gives an Output: {result:?}"
    );
    assert!(
        !stacked.join("note.txt").exists(),
        "the old stacked folder's note is gone"
    );
}

/// Runs each step of one row, requiring every step to give an Output.
fn run_steps(repo: &Repo, steps: &[&str], name: &str) -> Output {
    let mut result = None;
    for query in steps {
        result = Some(
            approve(&repo.path, &[query]).unwrap_or_else(|error| panic!("{name} {query}: {error}")),
        );
    }
    result.expect("every row has a step")
}

/// Adds an uncommitted copy of the alpha change as `003-alpha-thrice`.
fn one_copy(repo: &Repo) {
    copy_alpha(repo, "003-alpha-thrice");
}

/// Adds uncommitted copies of the alpha change as `003-alpha-thrice` and `004-alpha-four`.
fn two_copies(repo: &Repo) {
    copy_alpha(repo, "003-alpha-thrice");
    copy_alpha(repo, "004-alpha-four");
}

/// Makes the gamma change's proposal depend on `001`.
fn gamma_depends(repo: &Repo) {
    let path = repo.path.join("openspec/changes/002-gamma/proposal.md");
    let text = fs::read_to_string(&path).expect("the proposal reads");
    fs::write(
        path,
        text.replace("depends_on: []", "depends_on: [\"001\"]"),
    )
    .expect("the proposal is written");
}

/// Adds an uncommitted `003-alpha-thrice` whose branch was rejected before.
fn rejected_thrice(repo: &Repo) {
    copy_alpha(repo, "003-alpha-thrice");
    git(&repo.path, &["branch", "osq/003-alpha-thrice"]);
    git(&repo.path, &["checkout", "-q", "osq/003-alpha-thrice"]);
    let record = repo
        .path
        .join("openspec/changes/rejected/003-alpha-thrice/.run");
    fs::create_dir_all(&record).expect("the rejected record folder is created");
    fs::write(record.join("rejected.md"), "rejected\n").expect("the rejected record is written");
    git(&repo.path, &["add", "openspec/changes/rejected"]);
    git(&repo.path, &["commit", "-q", "-m", "osq: 003 rejected"]);
    git(&repo.path, &["checkout", "-q", "main"]);
}

/// Copies the alpha change folder to `name`, uncommitted.
fn copy_alpha(repo: &Repo, name: &str) {
    let from = repo.path.join("openspec/changes").join(ALPHA);
    let to = repo.path.join("openspec/changes").join(name);
    copy_tree(&from, &to);
}

/// Renders the last run as the golden script does, with `<root>` put back.
fn render(repo: &Repo, folder: &str, result: &Result<Output, FeatureError>) -> String {
    let stacked = repo.root.join("worktrees/repo/.stacked").join(folder);
    let copy = stacked.join("openspec/changes").join(folder);
    let checkout = repo.path.join("openspec/changes").join(folder);
    let mut lines = vec![outcome(result), "branches:".to_owned()];
    lines.extend(branches(&repo.path));
    lines.push("worktrees:".to_owned());
    lines.extend(worktrees(&repo.path));
    lines.push(format!(
        "checkout copy: {}",
        if checkout.exists() {
            "present"
        } else {
            "absent"
        }
    ));
    lines.push("record:".to_owned());
    lines.extend(record_lines(repo));
    lines.push("stacked:".to_owned());
    lines.extend(stacked_files(&stacked));
    lines.push("tree:".to_owned());
    lines.push(tree(&copy));
    lines
        .join("\n")
        .replace(&repo.root.display().to_string(), "<root>")
        .trim_end()
        .to_owned()
}

/// The outcome section of a run, as the golden script writes it.
fn outcome(result: &Result<Output, FeatureError>) -> String {
    match result {
        Ok(output) => {
            let kept: Vec<&str> = output
                .text
                .lines()
                .filter(|line| KEPT.iter().any(|prefix| line.starts_with(prefix)))
                .collect();
            format!("outcome: output\n{}", kept.join("\n"))
        }
        Err(error) => {
            let text = error.to_string();
            let message = text.strip_prefix("approve failed: ").unwrap_or(&text);
            format!("outcome: failed\n{}", message.trim_end())
        }
    }
}

/// Every file under `stacked`, relative and sorted, without the unprinted ones.
fn stacked_files(stacked: &Path) -> Vec<String> {
    let mut files = Vec::new();
    files_under(stacked, stacked, &mut files);
    files.retain(|relative| !left_out(relative));
    files.sort();
    files
}

/// The stacked copy's `.run` files, as the golden script writes them.
fn tree(folder: &Path) -> String {
    let mut files = Vec::new();
    files_under(folder, &folder.join(".run"), &mut files);
    files.sort();
    let mut lines = Vec::new();
    for relative in files {
        if left_out(&relative) {
            continue;
        }
        let text = fs::read_to_string(folder.join(&relative)).expect("a .run file is text");
        lines.push(format!("--- {relative}"));
        if let Some(stripped) = text.strip_suffix('\n') {
            lines.push(stripped.to_owned());
        } else {
            lines.push(format!("{text}\n(no newline)"));
        }
    }
    lines.join("\n")
}

/// Whether a relative path names a file the goldens leave out.
fn left_out(relative: &str) -> bool {
    LEFT_OUT
        .iter()
        .any(|name| relative.ends_with(&format!("/{name}")) || relative == *name)
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

/// A stacked golden's text.
fn golden(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/stacked-golden")
        .join(name);
    fs::read_to_string(path).expect("the golden reads")
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
