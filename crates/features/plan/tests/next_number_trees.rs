//! Proves plan's next change number counts worktrees, stacked approvals and
//! `osq/` branches when vcs is enabled, and only the checkout when it is not.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, Invocation, Output};
use osq_feature_plan::PlanFeature;

/// The one-item queue both scenarios use.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The git identity the scratch repository itself carries.
const NAME: &str = "Osq Test";
/// The email of that identity.
const EMAIL: &str = "osq@example.com";

/// One scratch repository with a checkout and a worktree root.
#[derive(Debug)]
struct Repo {
    /// The folder holding the checkout and every worktree.
    scratch: PathBuf,
    /// The canonical checkout on `main`.
    checkout: PathBuf,
}

impl Repo {
    /// Creates the repository named after the test with `vcs.enabled` as given.
    fn new(name: &str, enabled: bool) -> Self {
        let base = Path::new(env!("CARGO_TARGET_TMPDIR"))
            .join("next_number_trees")
            .join(name);
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("the scratch folder is created");
        let scratch = fs::canonicalize(&base).expect("the scratch folder resolves");
        let checkout = scratch.join("checkout");
        fs::create_dir_all(&checkout).expect("the checkout folder is created");
        let repo = Self {
            checkout: fs::canonicalize(&checkout).expect("the checkout resolves"),
            scratch,
        };
        repo.git(&repo.checkout, &["init", "-q", "-b", "main"]);
        repo.git(&repo.checkout, &["config", "user.name", NAME]);
        repo.git(&repo.checkout, &["config", "user.email", EMAIL]);
        repo.git(&repo.checkout, &["config", "commit.gpgSign", "false"]);
        repo.write(&repo.checkout, "openspec/queue.md", QUEUE);
        repo.write(&repo.checkout, "openspec/changes/007-x/notes.txt", "x\n");
        let worktrees = repo.scratch.join("worktrees");
        let config = format!(
            "[vcs]\nenabled = {enabled}\nauthor = \"{NAME} <{EMAIL}>\"\nworktreeRoot = \"{}\"\n",
            worktrees.display()
        );
        repo.write(&repo.checkout, "osq.toml", &config);
        repo.git(&repo.checkout, &["add", "-A"]);
        repo.git(&repo.checkout, &["commit", "-q", "-m", "initial"]);
        repo
    }

    /// Runs `git` in `dir` with only the scratch repository's own settings.
    fn git(&self, dir: &Path, args: &[&str]) -> String {
        let mut command = Command::new("git");
        command
            .args(args)
            .current_dir(dir)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CEILING_DIRECTORIES", &self.scratch)
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "maintenance.auto")
            .env("GIT_CONFIG_VALUE_0", "false");
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

    /// Writes one file under `dir`, creating its parent folders.
    fn write(&self, dir: &Path, relative: &str, text: &str) {
        assert!(
            dir.starts_with(&self.scratch),
            "the file sits in this repository"
        );
        let path = dir.join(relative);
        fs::create_dir_all(path.parent().expect("the file has a parent"))
            .expect("the file's folders are created");
        fs::write(path, text).expect("the file is written");
    }

    /// Adds a branch `osq/<folder>` with a real worktree, giving its path.
    fn add_worktree(&self, folder: &str) -> PathBuf {
        let path = self.scratch.join("worktrees").join(folder);
        fs::create_dir_all(path.parent().expect("the worktree has a parent"))
            .expect("the worktree's folder is created");
        let branch = format!("osq/{folder}");
        self.git(&self.checkout, &["branch", &branch]);
        self.git(
            &self.checkout,
            &[
                "worktree",
                "add",
                "-q",
                path.to_str().expect("the worktree path is text"),
                &branch,
            ],
        );
        path
    }

    /// Adds a branch `osq/<folder>` with no worktree.
    fn add_branch(&self, folder: &str) {
        self.git(&self.checkout, &["branch", &format!("osq/{folder}")]);
    }

    /// Adds one stacked approval folder under the configured worktree root.
    fn add_stacked(&self, folder: &str) {
        let root = self
            .scratch
            .join("worktrees")
            .join("checkout")
            .join(".stacked");
        self.write(
            &root.join(folder),
            &format!("openspec/changes/{folder}/proposal.md"),
            "---\ntitle: S\n---\n",
        );
    }
}

/// Runs `plan --next` in the repository's checkout.
fn run_plan(repo: &Repo) -> Output {
    PlanFeature::new()
        .run(&Invocation::new(
            &repo.checkout,
            "plan",
            vec!["--next".to_owned()],
        ))
        .expect("plan succeeds")
}

/// Proves "Next change number across worktrees".
///
/// Covers: rust-plan/next-change-number-across-worktrees
#[test]
fn next_change_number_across_worktrees() {
    let repo = Repo::new("across_worktrees", true);
    let worktree = repo.add_worktree("012-y");
    repo.write(&worktree, "openspec/changes/012-y/.run/approved", "");
    repo.add_branch("020-z");
    let _ = run_plan(&repo);
    let folder = repo.checkout.join("openspec").join("changes").join("021-a");
    assert!(folder.is_dir(), "the checkout creates 021-a");
}

/// Proves the stacked approvals of "Next change number across worktrees" count.
///
/// Covers: rust-plan/next-change-number-across-worktrees
#[test]
fn next_change_number_counts_stacked_approvals() {
    let repo = Repo::new("stacked_approvals", true);
    repo.add_stacked("030-c");
    let _ = run_plan(&repo);
    let folder = repo.checkout.join("openspec").join("changes").join("031-a");
    assert!(folder.is_dir(), "the checkout creates 031-a");
}

/// Proves "Next change number with vcs off".
///
/// Covers: rust-plan/next-change-number-with-vcs-off
#[test]
fn next_change_number_with_vcs_off() {
    let repo = Repo::new("with_vcs_off", false);
    let worktree = repo.add_worktree("012-y");
    repo.write(&worktree, "openspec/changes/012-y/.run/approved", "");
    repo.add_branch("020-z");
    let _ = run_plan(&repo);
    let folder = repo.checkout.join("openspec").join("changes").join("008-a");
    assert!(folder.is_dir(), "the checkout creates 008-a");
}
