//! Proves the entry path findings read the default branch and a change's
//! branch, stacked copy or checkout when git is on.

mod copy;
mod support;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::FeatureError;

use support::{run, write};

/// The task file every row writes.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The other change's task file whose scope creates `crates/delta/src/made.rs`.
const OTHER: &str = "openspec/changes/007-other/tasks/1.md";
/// The entry finding prefix for task `1.md`.
const ENTRY_ONE: &str =
    "001-clean: error openspec/changes/001-clean/tasks/1.md: Task 1 entry names";
/// The enabled version control settings.
const VCS: &str = "osq.toml";
/// The cleaner commit identity every test uses.
const AUTHOR: &str = "osq <osq@example.com>";

/// One row: how to prepare its repository, its extra files and its result.
struct Row {
    /// The scratch repository's folder name for this row.
    name: &'static str,
    /// Whether the row writes its own `osq.toml` before the first commit.
    settings: Option<String>,
    /// The extra preparation steps that write and commit branches.
    prepare: Vec<Step>,
    /// The files to write over the repository after preparation.
    files: Vec<(&'static str, String)>,
    /// The rows' result.
    result: Result<String, String>,
}

/// One preparation step on the scratch repository.
#[derive(Clone, Copy)]
enum Step {
    /// Create the other change's branch from `main`, holding its task file and
    /// its approval marker in the given folder, then return to `main`.
    Branch(&'static str),
    /// Make an empty branch named by the step, then return to `main`.
    EmptyBranch(&'static str),
    /// Commit the other change's archive folder with its approval marker on
    /// `main`.
    Landed,
    /// Create branch `trunk` at `main`.
    Trunk,
    /// Delete the committed `crates/delta/src/lib.rs` from the working tree.
    DeleteLib,
}

/// A scratch git repository holding the lint fixture project committed on `main`.
struct Repo {
    /// The repository's root.
    root: PathBuf,
}

impl Repo {
    /// Copies the fixture into a fresh scratch root and makes `main`.
    fn new(name: &str, settings: &str) -> Self {
        let root = copy::fixture(name);
        let repo = Self { root };
        repo.git(&["init", "-b", "main"]);
        write(&repo.root, VCS, settings);
        repo.commit("base");
        repo
    }

    /// Runs git in the repository with the isolated settings.
    fn git(&self, args: &[&str]) -> String {
        let mut command = Command::new("git");
        command.args(args).current_dir(&self.root);
        command
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env(
                "GIT_CEILING_DIRECTORIES",
                self.root.to_string_lossy().into_owned(),
            )
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "maintenance.auto")
            .env("GIT_CONFIG_VALUE_0", "false")
            .env("GIT_AUTHOR_NAME", AUTHOR)
            .env("GIT_COMMITTER_NAME", AUTHOR)
            .env("GIT_AUTHOR_EMAIL", "osq@example.com")
            .env("GIT_COMMITTER_EMAIL", "osq@example.com")
            .env("GIT_AUTHOR_DATE", "2000-01-01T00:00:00+0000")
            .env("GIT_COMMITTER_DATE", "2000-01-01T00:00:00+0000");
        let output = command.output().expect("git starts");
        assert!(
            output.status.success(),
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// Stages every file and commits it.
    fn commit(&self, message: &str) {
        let _ = self.git(&["add", "-A"]);
        let _ = self.git(&["commit", "-m", message]);
    }

    /// Creates the other change's branch with its task file and marker, then
    /// returns to `main`.
    fn branch(&self, marker: &str) {
        let _ = self.git(&["checkout", "-b", "osq/007-other"]);
        write(&self.root, OTHER, other());
        write(&self.root, marker, "hash\n");
        self.commit("other");
        let _ = self.git(&["checkout", "main"]);
    }

    /// Commits the other change's archive folder with its marker on `main`.
    fn landed(&self) {
        write(
            &self.root,
            "openspec/changes/archive/007-other/tasks/1.md",
            other(),
        );
        write(
            &self.root,
            "openspec/changes/archive/007-other/.run/approved",
            "hash\n",
        );
        self.commit("landed");
    }

    /// Creates an empty branch and returns to `main`.
    fn empty_branch(&self, branch: &str) {
        let _ = self.git(&["branch", branch, "main"]);
        let _ = self.git(&["checkout", "main"]);
    }
}

/// The task file whose entry is `entry`.
fn task(entry: &str) -> String {
    format!(
        "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/lib.rs\nentry:\n  \
         - {entry}\n---\n- [ ] a\n"
    )
}

/// The other change's task file, whose scope creates `crates/delta/src/made.rs`.
fn other() -> String {
    "---\ntitle: T\nverify: cargo test -p delta\nscope:\n  - crates/delta/src/made.rs\n---\n- [ \
     ] a\n"
        .to_owned()
}

/// The enabled version control settings.
fn settings() -> String {
    format!("[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\n")
}

/// The enabled settings whose worktree root is under the scratch repository.
fn stacked_settings(root: &Path) -> String {
    format!(
        "[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\nworktreeRoot = \"{}\"\n",
        root.join("worktrees").display()
    )
}

/// A finding for one missing entry in `main`.
fn missing(entry: &str) -> String {
    format!(
        "001-clean: 1 finding\n{ENTRY_ONE} {entry}, which is not in main and no task up to this \
         one creates"
    )
}

/// Every row of "Entry paths with git on", in the scenario's order.
fn rows_scenario() -> Vec<Row> {
    vec![
        Row {
            name: "committed_path",
            settings: None,
            prepare: Vec::new(),
            files: vec![(TASK, task("crates/delta/Cargo.toml"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "uncommitted_path",
            settings: None,
            prepare: Vec::new(),
            files: vec![
                (
                    "crates/delta/src/local.rs",
                    "//! local.\n\n/// local.\n///\n/// Implements: delta/adds-numbers\npub fn \
                     local() {}\n"
                        .to_owned(),
                ),
                (TASK, task("crates/delta/src/local.rs")),
            ],
            result: Err(missing("crates/delta/src/local.rs")),
        },
    ]
}

/// Extra rows covering the default branch, branches, stacked copies and checkouts.
fn rows_extra() -> Vec<Row> {
    let mut rows = rows_extra_tree();
    rows.extend(rows_extra_changes());
    rows.extend(rows_extra_branches());
    rows
}

/// The default branch and working tree rows.
fn rows_extra_tree() -> Vec<Row> {
    vec![
        Row {
            name: "deleted_from_checkout",
            settings: None,
            prepare: vec![Step::DeleteLib],
            files: vec![(TASK, task("crates/delta/src/lib.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "configured_default_branch",
            settings: Some(format!(
                "[vcs]\nenabled = true\nauthor = \"{AUTHOR}\"\ndefaultBranch = \"trunk\"\n"
            )),
            prepare: vec![Step::Trunk],
            files: vec![(TASK, task("crates/delta/src/gone.rs"))],
            result: Err(
                "001-clean: 1 finding\n001-clean: error openspec/changes/001-clean/tasks/1.md: \
                 Task 1 entry names crates/delta/src/gone.rs, which is not in trunk and no task \
                 up to this one creates"
                    .to_owned(),
            ),
        },
        Row {
            name: "landed_change",
            settings: None,
            prepare: vec![Step::Landed],
            files: vec![(TASK, task("crates/delta/src/made.rs"))],
            result: Err(missing("crates/delta/src/made.rs")),
        },
    ]
}

/// The other change's checkout rows.
fn rows_extra_changes() -> Vec<Row> {
    vec![
        Row {
            name: "checkout_marker",
            settings: None,
            prepare: Vec::new(),
            files: vec![
                (OTHER, other()),
                (
                    "openspec/changes/007-other/.run/approved",
                    "hash\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "archived_checkout_marker",
            settings: None,
            prepare: Vec::new(),
            files: vec![
                ("openspec/changes/archive/007-other/tasks/1.md", other()),
                (
                    "openspec/changes/archive/007-other/.run/approved",
                    "hash\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "stacked_marker",
            settings: None,
            prepare: Vec::new(),
            files: vec![(OTHER, other()), (TASK, task("crates/delta/src/made.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "unapproved_git_change",
            settings: None,
            prepare: Vec::new(),
            files: vec![(OTHER, other()), (TASK, task("crates/delta/src/made.rs"))],
            result: Err(missing("crates/delta/src/made.rs")),
        },
        Row {
            name: "change_folder_uncommitted",
            settings: None,
            prepare: Vec::new(),
            files: vec![
                ("openspec/changes/001-clean/notes.md", "x\n".to_owned()),
                (TASK, task("openspec/changes/001-clean/notes.md")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "change_folder_resolved",
            settings: None,
            prepare: Vec::new(),
            files: vec![
                ("openspec/changes/001-clean/notes.md", "x\n".to_owned()),
                (TASK, task("./openspec/changes/001-clean/notes.md")),
            ],
            result: Ok("001-clean: valid\n".to_owned()),
        },
    ]
}

/// The other change's branch rows.
fn rows_extra_branches() -> Vec<Row> {
    vec![
        Row {
            name: "approved_branch",
            settings: None,
            prepare: vec![Step::Branch("openspec/changes/007-other/.run/approved")],
            files: vec![(OTHER, other()), (TASK, task("crates/delta/src/made.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "archived_branch",
            settings: None,
            prepare: vec![Step::Branch(
                "openspec/changes/archive/007-other/.run/approved",
            )],
            files: vec![(OTHER, other()), (TASK, task("crates/delta/src/made.rs"))],
            result: Ok("001-clean: valid\n".to_owned()),
        },
        Row {
            name: "unapproved_branch",
            settings: None,
            prepare: vec![Step::EmptyBranch("osq/007-other")],
            files: vec![
                (OTHER, other()),
                (
                    "openspec/changes/007-other/.run/approved",
                    "hash\n".to_owned(),
                ),
                (TASK, task("crates/delta/src/made.rs")),
            ],
            result: Err(missing("crates/delta/src/made.rs")),
        },
    ]
}

/// Proves every row of "Entry paths with git on" in its own repository.
///
/// Covers: rust-lint/entry-paths-with-git-on
#[test]
fn lint_entry_git() {
    prove(rows_scenario(), "lint_entry_git");
}

/// Proves the default branch, branch, stacked and checkout providers.
///
/// Covers: rust-lint/entry-paths-with-git-on
#[test]
fn lint_entry_git_edges() {
    prove(rows_extra(), "lint_entry_git_edges");
}

/// Proves git is off when the project root is not the repository's top folder.
///
/// Covers: rust-lint/entry-paths-with-git-on
#[test]
fn lint_entry_git_nested_project() {
    let name = "lint_entry_git_edges/nested_project";
    let repo = Repo::new(name, &settings());
    move_into_nested(&repo.root);
    repo.commit("nested");
    write(&repo.root, "top.rs", "x\n");
    repo.commit("top");
    write(&repo.root.join("nested"), TASK, task("top.rs"));
    let error = run(&repo.root.join("nested"), "1").expect_err("the entry is missing");
    let FeatureError::Failed { message, .. } = error else {
        panic!("expected a failed error");
    };
    assert_eq!(
        message,
        "001-clean: 1 finding\n001-clean: error \
         openspec/changes/001-clean/tasks/1.md: Task 1 entry names top.rs, which is not in the \
         project and no task up to this one creates"
    );
}

/// Moves every fixture entry but `.git` into a `nested` folder.
fn move_into_nested(root: &Path) {
    let nested = root.join("nested");
    fs::create_dir_all(&nested).expect("the nested folder is created");
    for entry in fs::read_dir(root).expect("the repository is read") {
        let entry = entry.expect("the entry is read");
        if entry.file_name() == ".git" || entry.file_name() == "nested" {
            continue;
        }
        fs::rename(entry.path(), nested.join(entry.file_name())).expect("the entry is moved");
    }
}

/// Runs every row in its own scratch repository and checks its result.
fn prove(rows: Vec<Row>, prefix: &str) {
    for row in rows {
        let name = format!("{prefix}/{}", row.name);
        let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(&name);
        let settings = row.settings.clone().unwrap_or_else(|| {
            if row.name == "stacked_marker" {
                stacked_settings(&root)
            } else {
                settings()
            }
        });
        let repo = Repo::new(&name, &settings);
        prepare(&repo, &row);
        if row.name == "stacked_marker" {
            write_stacked(&repo);
        }
        finish(&repo, &row);
    }
}

/// Writes a row's branch preparation.
fn prepare(repo: &Repo, row: &Row) {
    for step in &row.prepare {
        match step {
            Step::Branch(marker) => repo.branch(marker),
            Step::EmptyBranch(branch) => repo.empty_branch(branch),
            Step::Landed => repo.landed(),
            Step::Trunk => repo.empty_branch("trunk"),
            Step::DeleteLib => remove(&repo.root, "crates/delta/src/lib.rs"),
        }
    }
}

/// Writes the stacked copy of the other change with its approval marker.
fn write_stacked(repo: &Repo) {
    let folder = repo.root.file_name().unwrap().to_string_lossy();
    let stacked = repo
        .root
        .join("worktrees")
        .join(folder.as_ref())
        .join(".stacked")
        .join("007-other")
        .join("openspec/changes/007-other");
    write(&stacked, ".run/approved", "hash\n");
}

/// Writes a row's files, runs `lint 1` and checks the result.
fn finish(repo: &Repo, row: &Row) {
    for (path, contents) in &row.files {
        write(&repo.root, path, contents);
    }
    match (run(&repo.root, "1"), &row.result) {
        (Ok(output), Ok(text)) => assert_eq!(&output.text, text, "{}", row.name),
        (Err(error), Err(text)) => match error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "lint", "{}: command", row.name);
                assert_eq!(&message, text, "{}", row.name);
            }
            other => panic!("{}: expected a failed error, got {other:?}", row.name),
        },
        (result, _) => panic!("{}: unexpected result {result:?}", row.name),
    }
}

/// Removes a file from the working tree, for the deleted-file row.
fn remove(root: &Path, path: &str) {
    fs::remove_file(root.join(path)).expect("the file is removed");
}
