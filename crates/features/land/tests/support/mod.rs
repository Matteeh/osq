//! Helpers shared by the land feature's tests: scratch repositories, worktree
//! changes and the feature's invocation.
//!
//! Each test binary compiles this module on its own, so some helpers are
//! unused in a given binary even though another test uses them.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_land::LandFeature;

/// The date every setup commit gets.
const DATE: &str = "2000-01-01T00:00:00+0000";
/// The author and committer name every setup commit gets.
const NAME: &str = "Osq Test";
/// The author and committer email every setup commit gets.
const EMAIL: &str = "osq@example.com";

/// The `osq.toml` a land repository starts with.
const OSQ_TOML: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.invalid>\"\n";
/// The fixture change's folder.
pub const FIXTURE_FOLDER: &str = "001-alpha-orders";

/// One worktree change: its folder and the worktree it lives in.
#[derive(Clone, Debug)]
pub struct ChangeTree {
    /// The change folder.
    pub folder: String,
    /// The worktree's canonical path.
    pub path: PathBuf,
}

/// One land repository under `CARGO_TARGET_TMPDIR`.
#[derive(Debug)]
pub struct LandRepo {
    /// The fresh folder holding the checkout and every worktree.
    scratch: PathBuf,
    /// The canonical checkout on `main`.
    root: PathBuf,
}

impl LandRepo {
    /// Creates a land repository named after the test and row.
    pub fn new(name: &str) -> Self {
        let base = Path::new(env!("CARGO_TARGET_TMPDIR"))
            .join("land_feature")
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
        repo.write(&repo.root, "notes.txt", "notes\n");
        repo.commit(&repo.root, "initial", &["src/one.txt", "notes.txt"]);
        repo.write(&repo.root, "osq.toml", OSQ_TOML);
        repo
    }

    /// The folder holding the checkout and every worktree.
    pub fn scratch(&self) -> &Path {
        &self.scratch
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

    /// The tree a rev names.
    pub fn tree(&self, dir: &Path, rev: &str) -> String {
        self.git(dir, &["rev-parse", &format!("{rev}^{{tree}}")])
            .trim()
            .to_owned()
    }

    /// The commit message a commit holds, exactly as stored.
    pub fn message(&self, commit: &str) -> String {
        let text = self.git(&self.root, &["cat-file", "commit", commit]);
        let (_, message) = text.split_once("\n\n").expect("a commit has a message");
        message.to_owned()
    }

    /// Adds a worktree change whose one more commit writes `src/one.txt` and
    /// `files` under its archived folder.
    pub fn add_change_with(&self, folder: &str, files: &[(&str, &[u8])]) -> ChangeTree {
        let change = self.add_worktree(folder);
        self.write(&change.path, "src/one.txt", "two\n");
        let archive = change.path.join("openspec/changes/archive").join(folder);
        fs::create_dir_all(&archive).expect("the archive folder is created");
        for (relative, contents) in files {
            self.write(&archive, relative, contents);
        }
        self.commit_all(&change.path, &format!("work on {folder}"));
        change
    }

    /// Adds a worktree change holding the fixture change's archived folder.
    pub fn add_fixture_change(&self) -> ChangeTree {
        let change = self.add_worktree(FIXTURE_FOLDER);
        self.write(&change.path, "src/one.txt", "two\n");
        let archive = change
            .path
            .join("openspec/changes/archive")
            .join(FIXTURE_FOLDER);
        copy_tree(&fixture(&format!("land-change/{FIXTURE_FOLDER}")), &archive);
        self.commit_all(&change.path, "work on the fixture change");
        change
    }

    /// Adds a worktree change that holds an active folder, not an archived one.
    pub fn add_unarchived_change(&self, folder: &str) -> ChangeTree {
        let change = self.add_worktree(folder);
        self.write(&change.path, "src/one.txt", "two\n");
        self.write(
            &change.path,
            &format!("openspec/changes/{folder}/proposal.md"),
            "---\ntitle: A\n---\n",
        );
        self.commit_all(&change.path, &format!("work on {folder}"));
        change
    }

    /// Adds a worktree change with any branch, cut from `main`.
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

    /// Removes one worktree, force included, keeping its branch.
    pub fn remove_worktree(&self, change: &ChangeTree) {
        let _ = self.git(
            &self.root,
            &[
                "worktree",
                "remove",
                "--force",
                change.path.to_str().expect("the worktree path is text"),
            ],
        );
    }

    /// Renames the branch one worktree has checked out.
    pub fn rename_branch(&self, change: &ChangeTree, name: &str) {
        let from = format!("osq/{}", change.folder);
        let _ = self.git(&change.path, &["branch", "-m", &from, name]);
    }

    /// The absolute path `git rev-parse --git-path <name>` prints in the checkout.
    pub fn git_path(&self, name: &str) -> PathBuf {
        let path = self.git(&self.root, &["rev-parse", "--git-path", name]);
        self.root.join(path.trim())
    }

    /// Runs the land feature's `land` with one query.
    pub fn run(&self, query: &str) -> Result<Output, FeatureError> {
        run_args(&self.root, "land", &[query])
    }

    /// Every file under `dir`, `.git` left out, as relative path and bytes.
    pub fn snapshot(&self, dir: &Path) -> BTreeMap<String, Vec<u8>> {
        assert!(
            dir.starts_with(&self.scratch),
            "the folder sits in this repository"
        );
        let mut files = BTreeMap::new();
        collect(dir, dir, &mut files);
        files
    }
}

/// Runs the land feature's `command` with literal `args` at `root`.
pub fn run_args(root: &Path, command: &str, args: &[&str]) -> Result<Output, FeatureError> {
    let args = args.iter().map(|arg| (*arg).to_owned()).collect();
    LandFeature.run(&Invocation::new(root, command, args))
}

/// The path of one fixture folder under the crate's `tests/fixtures`.
#[must_use]
pub fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// A fresh empty scratch folder under `CARGO_TARGET_TMPDIR`, named `name`.
#[must_use]
pub fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("land_feature")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    root
}

/// Copies a folder tree, dot folders and files included.
pub fn copy_tree(from: &Path, to: &Path) {
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

/// Adds one folder's files to `files`, leaving `.git` out.
fn collect(base: &Path, folder: &Path, files: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().is_some_and(|name| name == ".git") {
            continue;
        }
        if path.is_dir() {
            collect(base, &path, files);
        } else {
            let relative = path
                .strip_prefix(base)
                .expect("the file sits under the base folder")
                .to_string_lossy()
                .replace('\\', "/");
            files.insert(relative, fs::read(path).expect("the file is read"));
        }
    }
}
