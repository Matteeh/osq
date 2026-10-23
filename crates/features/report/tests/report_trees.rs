//! Proves `report` counts the changes of every git tree TypeScript counts.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, Invocation};
use osq_feature_report::ReportFeature;

/// The marker that says the worktree test runs in its own home.
const HOME_MARKER: &str = "OSQ_REPORT_TREES_HOME";
/// The marker that says the no-home test runs without a home.
const NO_HOME_MARKER: &str = "OSQ_REPORT_TREES_NO_HOME";

/// The `osq.toml` text a git-on test writes.
fn enabled_config() -> &'static str {
    "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n"
}

/// A scratch repository and its canonical checkout.
struct Repo {
    /// The scratch root that holds the checkout and its worktrees.
    base: PathBuf,
    /// The canonical checkout on `main`.
    root: PathBuf,
}

impl Repo {
    /// Creates a scratch checkout with the given `osq.toml`.
    fn new(test: &str, name: &str, config: &str) -> Self {
        let base = scratch(test, name);
        let root = base.join("checkout");
        fs::create_dir_all(&root).expect("the checkout folder is created");
        write(&root.join("osq.toml"), config);
        let repo = Self {
            base: fs::canonicalize(&base).expect("the scratch folder resolves"),
            root: fs::canonicalize(&root).expect("the checkout resolves"),
        };
        repo.git(&repo.root, &["init", "-q", "-b", "main"]);
        repo
    }

    /// Runs git in `dir` with isolated settings and the fixed identity.
    fn git(&self, dir: &Path, args: &[&str]) -> String {
        git(dir, &self.base, args)
    }

    /// Stages everything in `dir` and commits it.
    fn commit_all(&self, dir: &Path, message: &str) {
        self.git(dir, &["add", "-A"]);
        self.git(dir, &["commit", "-q", "-m", message]);
    }
}

/// Proves the text and JSON counts across the checkout and a worktree.
///
/// Covers: rust-report/report-across-worktrees
#[test]
fn report_across_worktrees() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_child("report_across_worktrees", HOME_MARKER, false);
        return;
    }
    let repo = Repo::new("worktree", "worktree", enabled_config());
    write_change(&repo.root, "001-a", 1, false, None);
    write_change(&repo.root, "002-b", 3, false, None);
    repo.commit_all(&repo.root, "root changes");

    let worktree = repo.base.join("worktree");
    repo.git(
        &repo.root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/002-b",
            worktree.to_str().expect("the worktree path is text"),
        ],
    );
    let worktree_change = worktree.join("openspec/changes/002-b");
    fs::remove_file(worktree_change.join("tasks/3.md")).expect("the third task is removed");
    write(&worktree_change.join(".run/approved"), "sha256:1\n");
    write(
        &worktree_change.join(".run/done/1"),
        "---\nscope_hash: sha256:1\n---\n",
    );
    repo.commit_all(&worktree, "worktree change");

    let text = run(&repo.root, &[]).expect("report prints text");
    assert_eq!(field(&text, "Total specs"), "2 (2 active, 0 archived)");
    assert_eq!(field(&text, "Total tasks"), "3");
    assert_eq!(field(&text, "Done"), "1");
    assert_eq!(field(&text, "Verified done"), "1");
    assert_eq!(field(&text, "Manual done"), "0");
    assert_eq!(field(&text, "Dead"), "0");
    assert_eq!(field(&text, "Regressed"), "0");
    assert_eq!(field(&text, "Running"), "0");
    assert_eq!(field(&text, "Pending"), "2");
    assert_eq!(field(&text, "Unmarked"), "0");
    assert_eq!(field(&text, "Completion rate"), "33.33%");

    write(
        &repo.root.join("osq.toml"),
        "[vcs]\nenabled = false\nauthor = \"osq <osq@example.com>\"\n",
    );
    let text = run(&repo.root, &[]).expect("report prints text with git off");
    assert_eq!(field(&text, "Total tasks"), "4");
    assert_eq!(field(&text, "Done"), "0");
    assert_eq!(field(&text, "Pending"), "4");
    assert_eq!(field(&text, "Completion rate"), "0%");
}

/// Proves a change found only under the stacked approvals root is counted.
///
/// Covers: rust-report/report-across-worktrees
#[test]
fn report_reads_stacked_approvals() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_child("report_reads_stacked_approvals", HOME_MARKER, false);
        return;
    }
    let repo = Repo::new("stacked", "stacked", enabled_config());
    write(&repo.root.join("README.md"), "fixture\n");
    repo.commit_all(&repo.root, "init");
    let home = PathBuf::from(std::env::var_os("HOME").expect("the child has a home"));
    let repo_name = repo.root.file_name().expect("the checkout has a name");
    let stacked = home
        .join(".osq/worktrees")
        .join(repo_name)
        .join(".stacked/020-stacked");
    write_change(&stacked, "archive/020-stacked", 1, true, Some(1));

    let text = run(&repo.root, &[]).expect("report prints stacked changes");
    assert_eq!(field(&text, "Total specs"), "1 (0 active, 1 archived)");
    assert_eq!(field(&text, "Total tasks"), "1");
    assert_eq!(field(&text, "Done"), "1");
    assert_eq!(field(&text, "Manual done"), "1");
    assert_eq!(field(&text, "Unmarked"), "0");
    assert_eq!(field(&text, "Completion rate"), "100%");
}

/// Proves report refuses a root below its repository's top level.
///
/// Covers: rust-vcs/every-git-command-refuses-a-nested-root
#[test]
fn report_git_off_below_the_repository_top() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_child(
            "report_git_off_below_the_repository_top",
            HOME_MARKER,
            false,
        );
        return;
    }
    let base = scratch("subdir", "subdir");
    let outer = base.join("outer");
    fs::create_dir_all(&outer).expect("the outer folder is created");
    write(&outer.join("README.md"), "fixture\n");
    git(&outer, &base, &["init", "-q", "-b", "main"]);
    git(&outer, &base, &["add", "-A"]);
    git(&outer, &base, &["commit", "-q", "-m", "init"]);
    let worktree = base.join("worktree");
    git(
        &outer,
        &base,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/009-x",
            worktree.to_str().expect("the worktree path is text"),
        ],
    );
    write_change(&worktree, "009-x", 1, true, None);
    git(&worktree, &base, &["add", "-A"]);
    git(&worktree, &base, &["commit", "-q", "-m", "worktree change"]);
    let sub = outer.join("sub");
    fs::create_dir_all(&sub).expect("the sub folder is created");
    write(&sub.join("osq.toml"), enabled_config());
    write_change(&sub, "001-local", 1, false, None);

    let root = fs::canonicalize(&sub).expect("the sub folder resolves");
    let top = fs::canonicalize(&outer).expect("the outer folder resolves");
    let error = run(&sub, &[]).expect_err("the nested root is refused");
    assert_eq!(
        error.to_string(),
        format!(
            "report failed: {} is inside the git repository at {} but is not its top level; run osq from {} or set vcs.enabled to false",
            root.display(),
            top.display(),
            top.display()
        )
    );
}

/// Proves an unset `HOME` adds no stacked approvals to the count.
///
/// Covers: rust-report/report-across-worktrees
#[test]
fn report_without_home_skips_stacked_approvals() {
    if std::env::var_os(NO_HOME_MARKER).is_none() {
        spawn_child(
            "report_without_home_skips_stacked_approvals",
            NO_HOME_MARKER,
            true,
        );
        return;
    }
    let repo = Repo::new("no-home", "no-home", enabled_config());
    write(&repo.root.join("README.md"), "fixture\n");
    repo.commit_all(&repo.root, "init");
    let text = run(&repo.root, &[]).expect("report prints with no home");
    assert_eq!(field(&text, "Total specs"), "0 (0 active, 0 archived)");
    assert_eq!(field(&text, "Total tasks"), "0");
}

/// Writes one change folder with the given tasks and optional markers.
fn write_change(root: &Path, folder: &str, tasks: u32, approved: bool, done: Option<u32>) {
    let change = root.join("openspec/changes").join(folder);
    write(
        &change.join("proposal.md"),
        "---\ntitle: A\n---\n## Goal\n\nA.\n",
    );
    for task in 1..=tasks {
        write(
            &change.join(format!("tasks/{task}.md")),
            "## Task\n\nDo it.\n",
        );
    }
    if approved {
        write(&change.join(".run/approved"), "sha256:1\n");
    }
    if let Some(task) = done {
        write(
            &change.join(format!(".run/done/{task}")),
            "---\nmanual: true\n---\n",
        );
    }
}

/// Runs one test in a child with its marker set and a fresh or absent home.
fn spawn_child(test: &str, marker: &str, without_home: bool) {
    let home = scratch("homes", &format!("{test}-home"));
    let mut command = Command::new(std::env::current_exe().expect("the test binary is known"));
    command
        .args(["--exact", test, "--nocapture"])
        .env(marker, "1");
    if without_home {
        command.env_remove("HOME");
    } else {
        command.env("HOME", &home);
    }
    let status = command.status().expect("the child starts");
    assert!(status.success(), "the child test {test} fails");
}

/// Runs `report` with literal arguments on a root.
fn run(root: &Path, args: &[&str]) -> Result<String, osq_core::FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    ReportFeature
        .run(&Invocation::new(root, "report", args))
        .map(|output| output.text)
}

/// The text after a `  Label:` line's colon and space.
fn field(text: &str, label: &str) -> String {
    let prefix = format!("  {label}: ");
    text.lines()
        .find_map(|line| line.strip_prefix(&prefix))
        .unwrap_or_else(|| panic!("no {label} line in {text}"))
        .to_owned()
}

/// A fresh scratch folder under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch(test: &str, name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("report_trees")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    root
}

/// Runs git in `dir` with isolated settings and the fixed identity.
fn git(dir: &Path, ceiling: &Path, args: &[&str]) -> String {
    let mut command = Command::new("git");
    command
        .args(["-c", "user.name=osq", "-c", "user.email=osq@example.com"])
        .args(args)
        .current_dir(dir)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", ceiling)
        .env("GIT_OPTIONAL_LOCKS", "0");
    let output = command.output().expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed in {}: {}",
        args.join(" "),
        dir.display(),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}
