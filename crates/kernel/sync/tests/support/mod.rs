//! Helpers shared by the sync kernel's tests: scratch repositories, worktree
//! changes and the kernel's invocation.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_kernel_config::{Limits, Timeouts, VcsConfig};
use osq_kernel_sync::{SyncKind, SyncOptions, SyncOutcome, SyncRequest, SyncStop, sync_change};

/// The date every setup commit gets.
const DATE: &str = "2000-01-01T00:00:00+0000";
/// The author and committer name every setup commit gets.
const NAME: &str = "Osq Test";
/// The author and committer email every setup commit gets.
const EMAIL: &str = "osq@example.com";
/// The author every sync commit carries.
const AUTHOR: &str = "osq <osq@example.invalid>";

/// One worktree change: its folder and the worktree it lives in.
#[derive(Clone, Debug)]
pub struct ChangeTree {
    /// The change folder's name.
    pub folder: String,
    /// The worktree's canonical path.
    pub path: PathBuf,
}

/// One sync repository under `CARGO_TARGET_TMPDIR`.
#[derive(Debug)]
pub struct SyncRepo {
    /// The fresh folder holding the checkout and every worktree.
    scratch: PathBuf,
    /// The canonical checkout on `main`.
    root: PathBuf,
}

impl SyncRepo {
    /// Creates a sync repository named after the test.
    pub fn new(name: &str) -> Self {
        let base = Path::new(env!("CARGO_TARGET_TMPDIR"))
            .join("sync_kernel")
            .join(name);
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("the scratch folder is created");
        let scratch = fs::canonicalize(&base).expect("the scratch folder resolves");
        let root = scratch.join("checkout");
        fs::create_dir_all(&root).expect("the checkout folder is created");
        let repo = Self {
            root: fs::canonicalize(&root).expect("the checkout resolves"),
            scratch,
        };
        repo.git(&repo.root, &["init", "-q", "-b", "main"]);
        repo.git(&repo.root, &["config", "user.name", NAME]);
        repo.git(&repo.root, &["config", "user.email", EMAIL]);
        repo.git(&repo.root, &["config", "commit.gpgSign", "false"]);
        repo.write(&repo.root, "src/one.txt", "one\n");
        repo.commit(&repo.root, "initial", &["src/one.txt"]);
        repo
    }

    /// The canonical checkout on `main`.
    pub fn checkout(&self) -> &Path {
        &self.root
    }

    /// Runs `git` in `dir` with the isolated settings, giving its output.
    pub fn git(&self, dir: &Path, args: &[&str]) -> String {
        let mut command = Command::new("git");
        command.args(args).current_dir(dir);
        isolate(&mut command, &self.scratch);
        command
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_AUTHOR_DATE", DATE)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .env("GIT_COMMITTER_DATE", DATE);
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

    /// Writes one file under `dir`, creating its folders.
    pub fn write(&self, dir: &Path, relative: &str, contents: impl AsRef<[u8]>) {
        assert!(
            dir.starts_with(&self.scratch),
            "the file sits in this repository"
        );
        let path = dir.join(relative);
        fs::create_dir_all(path.parent().expect("the file has a parent"))
            .expect("the file's folders are created");
        fs::write(path, contents).expect("the file is written");
    }

    /// Reads one file under `dir` as text.
    pub fn read(&self, dir: &Path, relative: &str) -> String {
        assert!(
            dir.starts_with(&self.scratch),
            "the file sits in this repository"
        );
        fs::read_to_string(dir.join(relative)).expect("the file reads")
    }

    /// Whether one path under `dir` exists.
    pub fn exists(&self, dir: &Path, relative: &str) -> bool {
        assert!(
            dir.starts_with(&self.scratch),
            "the path sits in this repository"
        );
        dir.join(relative).exists()
    }

    /// Stages exactly `paths` and commits them.
    pub fn commit(&self, dir: &Path, message: &str, paths: &[&str]) {
        let mut add = vec!["add", "--"];
        add.extend_from_slice(paths);
        let _ = self.git(dir, &add);
        let _ = self.git(dir, &["commit", "-q", "-m", message]);
    }

    /// Stages everything and commits it.
    pub fn commit_all(&self, dir: &Path, message: &str) {
        let _ = self.git(dir, &["add", "-A"]);
        let _ = self.git(dir, &["commit", "-q", "-m", message]);
    }

    /// HEAD's commit in `dir`.
    pub fn head(&self, dir: &Path) -> String {
        self.git(dir, &["rev-parse", "HEAD"]).trim().to_owned()
    }

    /// The commit a branch names.
    pub fn branch_head(&self, branch: &str) -> String {
        self.git(&self.root, &["rev-parse", branch])
            .trim()
            .to_owned()
    }

    /// The commit message a commit holds, exactly as stored.
    pub fn message(&self, commit: &str) -> String {
        let text = self.git(&self.root, &["cat-file", "commit", commit]);
        let (_, message) = text.split_once("\n\n").expect("a commit has a message");
        message.to_owned()
    }

    /// The absolute path `git rev-parse --git-path <name>` prints in `dir`.
    pub fn git_path(&self, dir: &Path, name: &str) -> PathBuf {
        let path = self.git(dir, &["rev-parse", "--git-path", name]);
        dir.join(path.trim())
    }

    /// Writes one checkout file and commits it as `message`.
    pub fn main_file(&self, relative: &str, contents: impl AsRef<[u8]>, message: &str) {
        self.write(&self.root, relative, contents);
        self.commit(&self.root, message, &[relative]);
    }

    /// Points git at a pre-commit hook that always fails.
    pub fn install_failing_hook(&self) {
        self.write(&self.scratch, "hooks/pre-commit", "#!/bin/sh\nexit 1\n");
        let hook = self.scratch.join("hooks/pre-commit");
        let mut permissions = fs::metadata(&hook).expect("the hook reads").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&hook, permissions).expect("the hook is executable");
        self.git(
            &self.root,
            &[
                "config",
                "core.hooksPath",
                self.scratch
                    .join("hooks")
                    .to_str()
                    .expect("the hooks path is text"),
            ],
        );
    }

    /// Adds a worktree change with branch `osq/<folder>`, cut from `main`.
    pub fn add_worktree(&self, folder: &str) -> ChangeTree {
        let path = self.scratch.join("worktrees").join(folder);
        fs::create_dir_all(path.parent().expect("the worktree has a parent"))
            .expect("the worktree's folder is created");
        let branch = format!("osq/{folder}");
        let _ = self.git(
            &self.root,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                &branch,
                path.to_str().expect("the worktree path is text"),
                "main",
            ],
        );
        ChangeTree {
            folder: folder.to_owned(),
            path: fs::canonicalize(path).expect("the worktree resolves"),
        }
    }

    /// Adds the archived change of "Sync outcomes" with the proposal verify.
    pub fn add_archived_change(&self, folder: &str, verify: &str) -> ChangeTree {
        let change = self.add_worktree(folder);
        self.write(&change.path, "src/one.txt", "two\n");
        let archived = format!("openspec/changes/archive/{folder}");
        self.write(
            &change.path,
            &format!("{archived}/proposal.md"),
            format!("---\ntitle: A\nverify: \"{verify}\"\n---\n## Verify\n\nx\n"),
        );
        self.commit_all(&change.path, &format!("work on {folder}"));
        change
    }

    /// Adds an active change with each task's verify command and a done marker.
    pub fn add_active_change(&self, folder: &str, tasks: &[(u32, &str)]) -> ChangeTree {
        let change = self.add_worktree(folder);
        self.write(&change.path, "src/one.txt", "two\n");
        let active = format!("openspec/changes/{folder}");
        self.write(
            &change.path,
            &format!("{active}/proposal.md"),
            "---\ntitle: A\n---\n## Verify\n\nx\n",
        );
        for (number, verify) in tasks {
            self.write(
                &change.path,
                &format!("{active}/tasks/{number}.md"),
                format!(
                    "---\ntitle: Task {number}\nverify: \"{verify}\"\nscope:\n  - src/one.txt\n---\n## Acceptance\n\n- [ ] Task {number} works.\n"
                ),
            );
            self.write(
                &change.path,
                &format!("{active}/.run/done/{number}"),
                "---\n---\n",
            );
        }
        self.commit_all(&change.path, &format!("work on {folder}"));
        change
    }

    /// Runs the sync kernel on one change with the row's options.
    pub fn sync(
        change: &ChangeTree,
        kind: SyncKind,
        options: SyncOptions,
    ) -> Result<SyncOutcome, SyncStop> {
        let settings = VcsConfig {
            author: Some(AUTHOR.to_owned()),
            ..VcsConfig::default()
        };
        let timeouts = Timeouts::default();
        let limits = Limits::default();
        let request = SyncRequest {
            worktree: &change.path,
            folder: &change.folder,
            kind,
            default_branch: "main",
            settings: &settings,
            timeouts: &timeouts,
            limits: &limits,
            options,
        };
        sync_change(&request)
    }
}

/// Applies the isolated settings no global or system git config may override.
fn isolate(command: &mut Command, scratch: &Path) {
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", scratch)
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "maintenance.auto")
        .env("GIT_CONFIG_VALUE_0", "false");
}
