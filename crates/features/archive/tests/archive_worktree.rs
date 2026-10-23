//! Proves archiving a change in an osq worktree matches TypeScript's goldens.

mod support;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_kernel_config::load_config;

use support::{copy_tree, fixture, run, scratch, tree};

/// The fixture change every scratch repository holds.
const FOLDER: &str = "007-sample";

/// The fixture change folder relative to an `openspec` root.
const CHANGE: &str = "openspec/changes/007-sample";

/// The copied goldens.
const GOLDEN: &str = "tests/fixtures/worktree-golden";

/// The TypeScript archive's golden project.
const GOLDEN_PROJECT: &str = "tests/golden/project/openspec";

/// The `osq.toml` every scratch repository holds.
const VCS_TABLE: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n";

/// One row of "Worktree archive equals TypeScript's".
struct Case {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// Whether the change sits in a worktree.
    worktree: bool,
    /// Whether an archive folder of the same name already exists.
    taken: bool,
    /// The output the archive gives.
    output: &'static str,
}

/// Every row of "Worktree archive equals TypeScript's", in table order.
const CASES: [Case; 3] = [
    Case {
        name: "worktree-007",
        worktree: true,
        taken: false,
        output: "openspec/changes/archive/007-sample on osq/007-sample",
    },
    Case {
        name: "taken-007",
        worktree: true,
        taken: true,
        output: "openspec/changes/archive/007-sample-1 on osq/007-sample",
    },
    Case {
        name: "root-007",
        worktree: false,
        taken: false,
        output: "openspec/changes/archive/007-sample",
    },
];

/// One scratch repository and the tree the change sits in.
struct Repo {
    /// The repository root.
    root: PathBuf,
    /// The tree that holds the change.
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

/// Builds the row's scratch repository as the golden script builds it.
fn repository(root: &Path, case: &Case) -> Repo {
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
    if case.taken {
        write(
            &repo
                .join("openspec/changes/archive")
                .join(FOLDER)
                .join("proposal.md"),
            "old\n",
        );
    }
    let change = fixture().join(CHANGE);
    if !case.worktree {
        copy_tree(&change, &repo.join(CHANGE));
    }
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    if !case.worktree {
        return Repo {
            tree: repo.clone(),
            root: repo,
            branch: "main".to_owned(),
        };
    }
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
    copy_tree(&change, &tree.join(CHANGE));
    git(&tree, &["add", "-A"]);
    git(&tree, &["commit", "-q", "-m", "osq: 007 approved"]);
    Repo {
        root: repo,
        tree,
        branch,
    }
}

/// Reads one copied golden.
fn golden(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(GOLDEN)
        .join(format!("{name}.txt"));
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

/// The body a golden holds, built from the tree's branch tip, commit and status.
fn body(repo: &Repo, name: &str) -> String {
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
    format!("name: {name}\ntip:\n{tip}commit:\n{commit}status:\n{status}")
}

/// Proves every row of "Worktree archive equals TypeScript's".
///
/// Covers: rust-archive/worktree-archive-equals-typescript-s
#[test]
fn worktree_archive_equals_typescript() {
    for case in &CASES {
        let root = scratch(case.name);
        let repo = repository(&root, case);
        let output = run(&repo.root, &["007"]).expect("the change archives");
        assert_eq!(output.text, case.output, "{}: output", case.name);
        let expected = golden(case.name);
        assert_eq!(
            body(&repo, golden_name(&expected)),
            expected,
            "{}: golden",
            case.name
        );
        if case.worktree && !case.taken {
            let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join(GOLDEN_PROJECT);
            assert_eq!(
                tree(&repo.tree.join("openspec")),
                tree(&golden),
                "{}: openspec",
                case.name
            );
        }
    }
}

/// Proves a path outside the archive's three folders is not committed.
///
/// Covers: rust-archive/worktree-archive-equals-typescript-s
#[test]
fn worktree_archive_leaves_other_paths_alone() {
    let case = Case {
        name: "worktree-007",
        worktree: true,
        taken: false,
        output: "openspec/changes/archive/007-sample on osq/007-sample",
    };
    let root = scratch("worktree-other-paths");
    let repo = repository(&root, &case);
    write(&repo.tree.join("keep.txt"), "mine\n");
    let output = run(&repo.root, &["007"]).expect("the change archives");
    assert_eq!(output.text, case.output);
    let mut expected = golden(case.name);
    expected
        .truncate(expected.find("status:\n").expect("the golden has a status") + "status:\n".len());
    expected.push_str("?? keep.txt\n");
    assert_eq!(body(&repo, golden_name(&expected)), expected);
}

/// Proves an archived folder does not answer an archive lookup.
///
/// Covers: rust-archive/change-named-by-id-or-folder
#[test]
fn archived_change_is_not_an_active_change() {
    let root = scratch("archived-change-lookup");
    let repo = root.join("repo");
    fs::create_dir_all(&repo).expect("the repository folder is created");
    git(&repo, &["init", "-q", "-b", "main"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    write(&repo.join("osq.toml"), VCS_TABLE);
    copy_tree(
        &fixture().join("openspec/specs"),
        &repo.join("openspec/specs"),
    );
    copy_tree(
        &fixture().join(CHANGE),
        &repo.join("openspec/changes/archive").join(FOLDER),
    );
    git(&repo, &["add", "-A"]);
    git(&repo, &["commit", "-q", "-m", "init"]);
    let error = run(&repo, &["007"]).expect_err("only an archived change has that name");
    assert_eq!(error.to_string(), "archive failed: no active change 007");
}

/// Proves a config that does not load fails first and writes nothing else.
///
/// Covers: rust-archive/config-that-does-not-load
#[test]
fn config_that_does_not_load() {
    let root = scratch("config-that-does-not-load");
    let text = "[vcs]\nenabled = true\n";
    fs::write(root.join("osq.toml"), text).expect("the config is written");
    let expected = load_config(&root).expect_err("the config does not load");
    let error = run(&root, &["007"]).expect_err("the config is refused");
    assert_eq!(error.to_string(), format!("archive failed: {expected}"));
    fs::remove_file(root.join("osq.toml")).expect("the test's config is removed");
    assert_eq!(tree(&root), tree(&fixture()), "the copy is the fixture");
}
